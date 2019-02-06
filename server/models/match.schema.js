const mongoose = require('mongoose');

module.exports = {
    name: "Match",
    plugins: {
        "@abskmj/mongoose-plugin-timestamps": true,
        events: true
    },
    schema: {
        players: {
            type: Object
        },
        server: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: "Server"
        }],
        format: String,
        map: String
    },
    options: {
        versionKey: false
    }
}
