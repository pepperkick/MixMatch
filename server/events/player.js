
module.exports = app => {
    const Player = app.connection.model("Player");
    const Discord = app.discord;

    Player.on("discord_change_nickname", async (data) => {
        const { doc, name, reason } = data;
        
        const member = await Discord.getMember(app.config.discord.guild, doc.id);
        const nickname = member.user.username;
        name = name.replace("<nickname>", nickname);

        await member.setNickname(nickname, reason);
    });
}