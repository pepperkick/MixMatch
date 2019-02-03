const event = require('events');

const events = {};

module.exports = (schema, options) => {  
    schema.virtual("events").get(function () {
        if (events[this.id]) return events[this.id];
        else {
            events[this.id] = new event.EventEmitter();

            return events[this.id];
        }
    });
}