const mongoose = require('mongoose');
const mongen = require('@abskmj/mongen');

module.exports = async(app) => {
    // mongo connection
    let connection = await mongoose.connect(
        app.config.connection, { useNewUrlParser: true });
    mongen.init(connection, __dirname + '/../models', app);
    
    return connection;
}