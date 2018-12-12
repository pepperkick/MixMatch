module.exports = (schema) => {
    schema.statics.findByDiscord = async function (id) {
        return await this.findOne({ discord: id });
    }

    schema.statics.findBySteam = async function (id) {
        return await this.findOne({ steam: id });
    }
}