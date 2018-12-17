module.exports = (schema, options) => {    
    schema.pre('save', function(next) {
        this._wasNew = this.isNew
        
        next();
    });
    
    schema.post('save', function(doc) {
        let model = this.model(doc.constructor.modelName);
        
        if (this._wasNew) {
            model.emit('new', doc)
        } else if (this.isModified()) {
            // emit an update event only when the document is modified
            model.emit('update', doc)
        }
    });
}