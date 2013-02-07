var racetrack = exports;

/**
 * A list of tracked objects, and their tracking configurations.
 * @type {Array.<{obj: Object, print: boolean, name: ?string}>}
 */
var allTracks;

racetrack.reset = function() {
  allTracks = [];
};
racetrack.reset();

/**
 * Traces an async function call, allowing us to note the
 *  start and end times in a debug mode, and to find any functions
 *  whose wrapped callbacks were created but not called.
 *
 * Wraps the given callback into the given object's trace.
 *
 * @param {Object} obj - Object whose track this is in
 * @param {Function} cb - Callback that ends the async function
 * @param {string=} name - Name of the function
 * @param {*...} var_args - Extras to print
 *
 * @return {Function} - Wrapped callback.
 */
racetrack.trace = function(obj, cb, name, var_args) {
  var track = racetrack._getTrack(obj);
  var count = track.calls.length;
  var args = [].slice.call(arguments, 2);
  var call = new Call(count, name, args);
  track.calls.push(call);

  if (track.printCallbacks) {
    // Print what callback we are wrapping.
    console.log('callback @ ' + call.descr + ' = ' + cb);
  }
  if (track.print) {
    // Print when we are starting a function body
    console.log(call.startStr(track.indent));
  }
  if (track.stacktraces) {
    call.stack = new Error().stack.slice(5);
  }

  // Return the wrapped callback, which completes our Call when called
  return function(){
    if (call.done) {
      console.error('Multiple calls to the same callback. Bug!');
    }

    call.done = true;

    if (track.print) {
      console.log(call.endStr(track.indent));
    }

    cb.apply(null, arguments);
  }.bind(obj);
};

/**
 * Placeholder for trace.
 * @param {Object} obj - As above
 * @param {Function} cb - As above
 * @return {Function} - cb
 */
racetrack.traceholder = function (obj, cb) {
  return cb;
};

/**
 * @
 */
racetrack.configure = function(obj, opts) {
  var track = racetrack._getTrack(obj);

  opts = opts || {};
  track.print = !!opts.print;
  track.printCallbacks = !!opts.printCallbacks;
  track.name = opts.name || track.name;
  track.stacktraces = !!opts.stacktraces;
  track.indent = opts.indent || 0;

  if (obj.trace) {
    obj.trace = racetrack.trace;
  }
};

/**
 * Prints a report of any incomplete calls made.
 * Does not show tracks with all complete unless asked explicitly to.
 * Constrains to the specified object, if given.
 *
 * @param {{showOK: boolean=, obj: Object=}} opts
 */
racetrack.report = function(opts) {
  opts = opts || {};

  for (var i = 0, len_i = allTracks.length; i < len_i; ++i) {
    var track = allTracks[i];
    if (opts.obj && track !== obj) {
      continue;
    }

    var calls = track.calls;
    var incomplete = [];
    for (var j = 0, len_j = calls.length; j < len_j; ++j) {
      var call = calls[j];
      if (!call.done) {
        incomplete.push(call);
      }
    }

    // print summary if appropriate
    var num = incomplete.length;
    if (num || opts.showOK) {
      var sum = (num ? num : 'No');
      console.log(sum + ' incomplete calls in ' + track.obj + '.');
    }

    // print all the incomplete calls
    incomplete.forEach(function(call) {
      console.log(call);
    });
  }
};

/**
 * Clears the call list on the given object's track
 */
racetrack.clear = function(obj) {
  racetrack._getTrack(obj).clear();
};

/**
 * Get or create and return the track for the given object.
 *
 * @param {Object} obj
 * @return {Track}
 */
racetrack._getTrack = function(obj) {
  // If there is an existing track for the object, return it
  for (var i = 0, len = allTracks.length; i < len; ++i) {
    var cur = allTracks[i];
    if (cur.obj === obj) {
      return cur;
    }
  }

  // No existing track, create a new one
  return new Track(obj);
};

var Track = function(obj) {
  this.obj = obj;
  allTracks.push(this);
  this.clear();
};

Track.prototype.clear = function() {
  this.calls = [];
};

var Call = function(idNum, name, args) {
  this.args = args;
  this.count = idNum;
  this.name = name;
  this.descr = '[' + this.count + ':' + this.name + ']';
};

Call.prototype.descr_ = function(opt_indent) {
  return this.indent(opt_indent) + this.descr;
};

Call.prototype.startStr = function(opt_indent) {
  return this.descr_(opt_indent) + ' ' + this.args.join(' ');
};

Call.prototype.endStr = function(opt_indent) {
  return this.descr_(opt_indent) + ' done.';
};

Call.prototype.toString = function() {
  return '<call ' + this.startStr() + '>' + (this.stack || '');
};

Call.prototype.indent = function(spaces) {
  return new Array(spaces * this.count).join(' ');
};



// Register in a mocha bdd test case
racetrack.use = function(obj, cfg) {
  beforeEach(function() {
    racetrack.configure(obj, cfg);
  });

  afterEach(function() {
    racetrack.report();
    racetrack.reset();
  });
};
