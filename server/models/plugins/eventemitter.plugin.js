const event = require('events');

const cache = {};

module.exports = (schema, options) => {  
    schema.virtual("events").get(function () {
        if (cache[this.name]) return cache[this.name];
        else {
            cache[this.name] = new event.EventEmitter();

            return cache[this.name];
        }
    });
}