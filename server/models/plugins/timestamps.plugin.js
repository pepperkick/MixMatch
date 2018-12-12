module.exports = (schema, options) => {
    schema.add({
        createdAt: {
            type: Date,
            default: new Date()
        }
    });
    
    schema.add({ modifiedAt: Date });

    schema.pre('save', function(next) {
        if (this.isModified()) {
            this.modifiedAt = new Date();
        }

        next();
    });
};
