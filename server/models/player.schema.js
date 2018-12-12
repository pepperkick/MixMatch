module.exports = {
    name: "Player",
    plugins: {
        timestamps: true,
    },
    schema: {
        steam: String,
        discord: String
    },
    options: {
        versionKey: false
    }
}
