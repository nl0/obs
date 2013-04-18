/*! obs 0.6.0 Copyright (c) 2013 Alan Plum. MIT licensed. */
define(function(require, exports) {
var aug = require('aug'),
    PubSub = require('sublish').PubSub,
    slice = Array.prototype.slice,
    isArray = Array.isArray ? Array.isArray : function(arr) {
        return Object.prototype.toString.call(arr) === '[object Array]';
    };


exports.prop = aug(function(initialValue) {
    function prop(value) {
        if (arguments.length) {
            prop._previousValue = prop._currentValue;
            prop._currentValue = value;
            prop.notify();
        } else {
            return prop._currentValue;
        }
    }

    aug(prop, PubSub.prototype, {
        _initialValue: initialValue,
        _currentValue: initialValue,
        dirty: false
    }, exports.prop.fn);

    PubSub.apply(prop);
    
    return prop;
}, {
    readOnly: function(initialValue) {
        function prop() {
            if (arguments.length) {
                throw new Error('This observable is read-only!');
            } else {
                return prop._currentValue;
            }
        }

        aug(prop, PubSub.prototype, {
            _initialValue: initialValue,
            _currentValue: initialValue,
            dirty: false
        }, exports.prop.fn);

        PubSub.apply(prop);

        return prop;
    },
    fn: {
        __is_obs__: true,
        notify: function() {
            this.dirty = (this._currentValue === this._initialValue);
            this.publish(this._currentValue, this._previousValue);
        },
        peek: function() {
            return this._currentValue;
        },
        reset: function() {
            this(this._initialValue);
        }
    }
});


function lazyComputed(readFn, writeFn) {
    var changed = true;
    function computed() {
        if (arguments.length) {
            if (typeof writeFn !== 'function') {
                throw new Error('This observable is read-only!');
            }
            writeFn.apply(computed, arguments);
        } else {
            computed._previousValue = computed._currentValue;
            if (changed) {
                computed._currentValue = readFn.apply(computed);
                changed = false;
                computed.notify();
            }
            return computed._currentValue;
        }
    }
    return aug(computed, {
        _initialValue: undefined,
        _onNotify: function() {
            changed = true;
        }
    });
}


function eagerComputed(readFn, writeFn) {
    function computed() {
        if (arguments.length) {
            if (typeof writeFn !== 'function') {
                throw new Error('This observable is read-only!');
            }
            writeFn.apply(computed, arguments);
        } else {
            return computed._currentValue;
        }
    }
    return aug(computed, {
        _initialValue: readFn.apply(computed),
        _onNotify: function() {
            computed._previousValue = computed._currentValue;
            computed._currentValue = readFn.apply(computed);
            computed.notify();
        }
    });
}


function writeOnlyComputed(writeFn) {
    function computed() {
        if (arguments.length) {
            writeFn.apply(computed, arguments);
        } else {
            throw new Error('This observable is write-only!');
        }
    }
    computed._initialValue = undefined;
    return computed;
}


exports.computed = aug(function(readFn, writeFn, watched) {
    var lazy = false;
    if (arguments.length === 1 && typeof readFn === 'object') {
        writeFn = readFn.write;
        watched = readFn.watched;
        lazy = readFn.lazy;
        readFn = readFn.read;
        if (watched && !isArray(watched)) {
            watched = [watched];
        }
    } else if (arguments.length === 2 && isArray(writeFn)) {
        watched = writeFn;
        writeFn = undefined;
    }

    if (!readFn && !writeFn) {
        throw new Error('No read function and no write function provided!');
    }

    var computed = (
        readFn ? (
            lazy ? lazyComputed : eagerComputed
        )(readFn, writeFn) : writeOnlyComputed(writeFn)
    );

    aug(computed, PubSub.prototype, {
        _currentValue: computed._initialValue,
        dirty: false,
        _subscriptions: []
    }, exports.computed.fn);

    PubSub.apply(computed);

    if (readFn && isArray(watched)) {
        computed.watch.apply(computed, watched);
    }

    return computed;
}, {
    lazy: function(readFn, writeFn, watched) {
        if (arguments.length === 1 && typeof readFn === 'object') {
            return exports.computed(aug({lazy: true}, readFn));
        } else if (arguments.length === 2 && isArray(writeFn)) {
            watched = writeFn;
            writeFn = undefined;
        }
        return exports.computed({
            read: readFn,
            write: writeFn,
            watched: watched,
            lazy: true
        });
    },
    fn: aug({}, exports.prop.fn, {
        watch: function() {
            var args = slice.call(arguments, 0);
            var sub, i;
            for (i = 0; i < args.length; i++) {
                sub = args[i];
                if (sub && typeof sub.subscribe === 'function') {
                    sub.subscribe(this._onNotify);
                    this._subscriptions.push(sub);
                }
            }
            return this;
        },
        unwatch: function() {
            var subs = slice.call(arguments, 0),
                allSubs = this._subscriptions,
                i, j, sub;

            for (i = 0; i < subs.length; i++) {
                sub = subs[i];
                if (sub && typeof sub.unsubscribe === 'function') {
                    sub.unsubscribe(this._onNotify);
                }
            }

            this._subscriptions = [];
            for (i = 0; i < allSubs.length; i++) {
                 sub = allSubs[i];
                 for (j = 0; j < subs.length; j++) {
                    if (subs[j] === sub) {
                        this._subscriptions.push(sub);
                        break;
                    }
                 }
            }
            return this;
        },
        dismiss: function() {
            this.unwatch.apply(this, this._subscriptions);
        }
    })
});
});