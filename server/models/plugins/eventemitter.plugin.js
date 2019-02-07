const event = require('events');

module.exports = (schema, options) => {  
    schema.virtual("events").get(function () {
        if (this._eventEmitter) return this._eventEmitter;
        else {
            this._eventEmitter = new event.EventEmitter();

            return this._eventEmitter;
        }
    });
}