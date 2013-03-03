var should = require('shoulda');
var racetrack = require('..');
var besync = require('besync');

var TestClass = function () {
  this.sub = new TestChildClass();
};
TestClass.prototype.toString = function () {
  return 'TestClass';
};
TestClass.prototype.init = function (cb) {
  this.sub.init(cb);
};
var TestChildClass = function () {}
TestChildClass.prototype.toString = function () {
  return 'TestChildClass';
};
TestChildClass.prototype.init = function (cb) {
  var randomThing = function (next) {next(null, 'random')};

  besync.waterfall(cb, [
    this.thing1,
    randomThing,
    this.thing2
  ], this);
};
TestChildClass.prototype.thing1 = function (next) {next()};
TestChildClass.prototype.thing2 = function (input, next) {next()};

var _log = racetrack.log;

describe('racetrack', function () {
  afterEach(function () {
    racetrack.log = _log;
    racetrack.__trackCount = 0;
  });

  it('(classes work without racetrack)', function (done) {
    var tc = new TestClass();
    tc.init(done);
  });

  var singleMergedLog = [
    ['[0:0:init] init'],
    ['[1:0:init] init'],
    ['[1:1:thing1] thing1'],
    ['[1:1:thing1] done.'],
    ['[1:2:thing2] thing2'],
    ['[1:2:thing2] done.'],
    ['[1:0:init] done.'],
    ['[0:0:init] done.'],
  ];

  var singleOuterLog = [
    ['[0:0:init] init'],
    ['[0:0:init] done.'],
  ];

  var singleInnerLog = [
    ['[1:0:init] init'],
    ['[1:1:thing1] thing1'],
    ['[1:1:thing1] done.'],
    ['[1:2:thing2] thing2'],
    ['[1:2:thing2] done.'],
    ['[1:0:init] done.'],
  ];

  it('works silently', function (done) {
    var out = [];
    racetrack.log = function () {
      out.push([].slice.call(arguments));
    };

    var tc = new TestClass();
    var tracks = racetrack.configure([tc, tc.sub]);
    tc.init(function () {
      out.should.eql([]);
      // print should not affect the inner log bits
      tracks[0].logs.should.eql(singleOuterLog);
      tracks[1].logs.should.eql(singleInnerLog);
      done();
    });
  });

  it('works with multiple classes', function (done) {
    var out = [];
    racetrack.log = function () {
      out.push([].slice.call(arguments));
    };

    var tc = new TestClass();
    var tracks = racetrack.configure([tc, tc.sub], {print: true});
    tc.init(function () {
      out.should.eql(singleMergedLog);
      tracks[0].logs.should.eql(singleOuterLog);
      tracks[1].logs.should.eql(singleInnerLog);
      done();
    });
  });


  var doubleMergedLog = singleMergedLog.concat([
    ['[0:1:init] init'],
    ['[1:3:init] init'],
    ['[1:4:thing1] thing1'],
    ['[1:4:thing1] done.'],
    ['[1:5:thing2] thing2'],
    ['[1:5:thing2] done.'],
    ['[1:3:init] done.'],
    ['[0:1:init] done.'],
  ]);
  var doubleOuterLog = singleOuterLog.concat([
    ['[0:1:init] init'],
    ['[0:1:init] done.'],
  ]);
  var doubleInnerLog = singleInnerLog.concat([
    ['[1:3:init] init'],
    ['[1:4:thing1] thing1'],
    ['[1:4:thing1] done.'],
    ['[1:5:thing2] thing2'],
    ['[1:5:thing2] done.'],
    ['[1:3:init] done.'],
  ]);

  it('works multiple times', function (done) {
    var out = [];
    racetrack.log = function () {
      out.push([].slice.call(arguments));
    };

    var tc = new TestClass();
    var tracks = racetrack.configure([tc, tc.sub], {print: true});
    tc.init(function () {
      out.should.eql(singleMergedLog);
      tc.init(function () {
        tracks[0].logs.should.eql(doubleOuterLog);
        tracks[1].logs.should.eql(doubleInnerLog);
        out.should.eql(doubleMergedLog);
        done();
      })
    });
  });

  it('stops logging after reset', function (done) {
    var out = [];
    racetrack.log = function () {
      out.push([].slice.call(arguments));
    };

    var tc = new TestClass();
    var tracks = racetrack.configure([tc, tc.sub], {print: true});
    tc.init(function () {
      out.should.eql(singleMergedLog);
      racetrack.reset();
      tc.init(function () {
        out.should.eql(singleMergedLog);
        done();
      })
    });
  });

  // TODO(gregp): ensure that reset works properly for object-local functions
  // TODO(gregp): exercise stacktraces, printCallbacks, indent

  it('can give a blank report', function (done) {
    var out = [];
    racetrack.log = function () {
      out.push([].slice.call(arguments));
    };

    var tc = new TestClass();
    var tracks = racetrack.configure([tc, tc.sub]);
    tc.init(function () {
      tracks[0].logs.should.eql(singleOuterLog);
      tracks[1].logs.should.eql(singleInnerLog);
      racetrack.report();
      out.should.eql([]);
      done();
    });
  });

  it('notes incompletions in a report', function (done) {
    var out = [];
    racetrack.log = function () {
      out.push([].slice.call(arguments));
    };

    var tc = new TestClass();
    var tracks = racetrack.configure([tc, tc.sub], {print: true});

    // Simulate beginning a function but not actually making the callback
    tc.sub.thing2 = function (next) {
      racetrack.trace(this, next, 'thing2');
    };
    tc.init(function () {
      done(new Error('should not have called back. This should be hanging.'));
    });

    setTimeout(function () {
      out.should.eql([
        ['[0:0:init] init'],
        ['[1:0:init] init'],
        ['[1:1:thing1] thing1'],
        ['[1:1:thing1] done.'],
        ['[1:2:thing2] thing2'],
      ]);
      out = [];

      racetrack.report();

      out.shift().should.eql([ '1 incomplete calls in TestClass.' ]);
      var tcIncs = out.shift();
      tcIncs.should.have.length(1);
      tcIncs[0]['args'].should.eql(['init']);

      out.shift().should.eql([ '2 incomplete calls in TestChildClass.' ]);
      var tccIncs = out.shift();
      tccIncs.should.have.length(1);
      tccIncs[0]['args'].should.eql(['init']);
      tccIncs = out.shift();
      tccIncs.should.have.length(1);
      tccIncs[0]['args'].should.eql(['thing2']);

      done();
    });
  });

})
