var racetrack = exports;

/**
 * A counter for the tracks; increases after each new track.
 */
racetrack.__trackCount = 0;

/**
 * A list of tracked objects, and their tracking configurations.
 * @type {Array.<{obj: Object, print: boolean, name: ?string}>}
 */
var allTracks;

racetrack.reset = function() {
  allTracks && allTracks.forEach(Track.unwrap);
  allTracks = [];
};
racetrack.reset();
racetrack.resetThen = function (fn) {
  return function () {
    racetrack.reset();
    fn.apply(this, arguments);
  }
};

/**
 * console.log proxy for debugging purposes.
 */
racetrack.log = function () {
  console.log.apply(console, arguments);
};

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
  var args = [].slice.call(arguments, 3);
  var call = new Call(track.id, count, name, args);
  track.calls.push(call);

  // Print what callback we are wrapping.
  track.logCallback('callback @ ' + call.descr + ' = ' + cb);
  // Print when we are starting a function body
  track.logCall(call.startStr(track.indent));

  if (track.stacktraces) {
    call.stack = new Error().stack.slice(5);
  }


  // Return the wrapped callback, which completes our Call when called
  var wrapped = function(){
    if (call.done) {
      console.error('Multiple calls to the same callback. Bug!');
    }

    track.logCall(call.endStr(track.indent));
    call.done = true;
    // console.log('ending ' + call.descr);

    cb.apply(null, arguments);
  }.bind(obj);
  wrapped.call = call;

  return wrapped;
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
 * @param {Object|Array.<Object>} objs
 */
racetrack.configure = function(objs, opts) {
  if (!Array.isArray(objs)) {
    objs = [objs];
  }
  return objs.map(function (obj) {
    var track = racetrack._getTrack(obj);

    opts = opts || {};
    track.print = !!opts.print;
    track.printCallbacks = !!opts.printCallbacks;
    track.name = opts.name || track.name;
    track.stacktraces = !!opts.stacktraces;
    track.indent = opts.indent || 0;
    track.fns = opts.fns;
    track.wrap();

    return track;
  });
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
      racetrack.log(sum + ' incomplete calls in ' + track.obj + '.');
    }

    // print all the incomplete calls
    incomplete.forEach(function(call) {
      racetrack.log(call);
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

/**
 * Register in a mocha bdd test case
 * This is very much not ideal yet, since the object needs to be created
 *  *outside* of the actual function under test.
 */
racetrack.mochaHook = function(obj, cfg) {
  beforeEach(function() {
    if (obj) {
      racetrack.configure(obj, cfg);
    }
  });

  afterEach(function() {
    racetrack.report();
    racetrack.reset();
  });
};



/**
 * A Track represents a classy object that is being tracked.
 * We wrap all its method functions with tracers, and are prepared to
 *  unwrap at any time.
 *
 * @param {Object} obj
 */
var Track = function(obj) {
  this.id = racetrack.__trackCount++;
  this.obj = obj;
  this.backups = {};
  allTracks.push(this);
  this.clear();
};

Track.prototype.clear = function() {
  this.calls = [];
  this.logs = [];
};

Track.prototype.log = function () {
  this.logs.push([].slice.call(arguments));
  racetrack.log.apply(this, arguments);
};

Track.prototype.logCall = function (str) {
  this.logs.push([str]);
  if (this.print) {
    racetrack.log(str);
  }
};
Track.prototype.logCallback = function (str) {
  if (this.printCallbacks) {
    this.log(str);
  }
};

Track.prototype.unwrap = function () {
  var key;
  for (key in this.backups) {
    var backup = this.backups[key];
    var isLocal = backup[1];
    var fn = backup[0];

    if (isLocal) {
      // this.obj.hasOwnProperty(key) was true when wrapping
      this.obj[key] = fn;
    } else {
      // The property came from the prototype
      delete this.obj[key];
    }
  }
};

Track.unwrap = function (track) {
  track.unwrap();
};

Track.wrapper = function (obj, name, backups) {
  var calls = [];
  // backups[name][1] = bool indicating locality
  var realFn = backups[name][0];
  var wrapped = function () {
    var args = [].slice.call(arguments);
    var cb = args.pop();
    // Ensure the last argument is a callback
    if (typeof cb !== 'function') {
      // Otherwise bail out.
      return realFn.apply(this, arguments);
    }

    // Collect the arguments and extras for the call trace
    var traceArgs = [obj, cb, name].concat(args);
    // Start the call trace (this registers an outstanding call)
    var trace = racetrack.trace.apply(this, traceArgs);
    // Restore the trace end as the function's callback param
    args.push(trace);

    // Retain the call info from the trace
    calls.push(trace.call);

    return realFn.apply(this, args);
  };
  // Annotate the function with the retained call info
  wrapped.calls = calls;
  return wrapped;
};

/**
 * Wrap the given object, ensuring that it will provide real output messages
 *  when appropriate.
 */
Track.prototype.wrap = function () {
  var obj = this.obj;
  var fnSpec = this.fns || {};
  var backups = racetrack._getTrack(obj).backups;

  var x;
  for (x in obj) {
    var cur = obj[x];
    if (
      // It is not a function
      'function' !== typeof cur ||
      // We have an explicit false flag for this function name
      fnSpec[x] === false ||
      // We have already wrapped this function
      backups[x]
    ) {
      // Skip this property.
      continue;
    }

    // Make the replacement for explicit true flag or when > 0 args accepted
    if (fnSpec[x] === true || cur.length) {
      // Need to retain whether this function was defined locally or not
      //  in addition to the function to proxy through to.
      backups[x] = [cur, obj.hasOwnProperty(x)];
      // Create the wrapper
      obj[x] = Track.wrapper(obj, x, backups);
    }
  }
};




var Call = racetrack.Call = function(trackId, callId, name, args) {
  this.args = args;
  this.trackId = trackId;
  this.id = callId;
  this.name = name;
  this.descr = '[' + this.trackId + ':' + this.id + ':' + this.name + ']';
};

Call.prototype.descr_ = function(opt_indent) {
  return this.indent(opt_indent) + this.descr;
};

Call.prototype.startStr = function(opt_indent) {
  return this.descr_(opt_indent) +
    (this.args.length ? ' ' : '') +
    this.args.join(' ');
};

Call.prototype.endStr = function(opt_indent) {
  return this.descr_(opt_indent) + ' done.';
};

Call.prototype.toString = function() {
  return '<call ' + this.startStr() + '>' + (this.stack || '');
};

Call.prototype.indent = function(spaces) {
  return new Array(spaces * this.id).join(' ');
};
