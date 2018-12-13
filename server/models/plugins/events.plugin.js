const events = require('events');

module.exports = (schema, options) => {
    const em =new events.EventEmitter()
    
    schema.statics.events = em;
    
    schema.pre('save', function(next) {
        this._wasNew = this.isNew
        
        next();
    });
    
    schema.post('save', function(doc) {
        if (this._wasNew) {
            em.emit('new', doc)
        } else {
            em.emit('update', doc)
        }
    });
}