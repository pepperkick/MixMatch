const event = require('events');
const debug = require('debug');
const Discord = require('discord.js');

const log = debug('app:service:discord');
const bot = new Discord.Client();

module.exports = async (app) => {
    const em = new event.EventEmitter();

    // Emitted when the bot has logged in and connected to discord
    bot.on('ready', async () => {
        log('Service Started!');

        // bot.user.setUsername(app.config.bot.name);
        // bot.user.setAvatar(app.config.get.bot.avatar);

        em.emit("ready");
    });
 
    // Emitted when the bot can read a new message
    bot.on('message', async message => {
        if (message.author.id === bot.user.id) return;      // Filter messages sent by the bot itself
        if (message.author.bot) return;                     // Filter messages sent by other bots

        em.emit('message', message);
    });

    // Emitted when a new member is added to a guild that the bot is in
    bot.on('guildMemberAdd', async (member) => {
        if (member.guild.id !== app.config.discord.guild) return;   // Filter out new members from other guilds that the bot might be in

        log(`New member joined the guild ${member.user.id}`)
  
        em.emit("newMember", member);
    });

    // Sends a message to a channel
    async function sendToChannel(channel, options) {
        if (typeof channel === String) {
            channel = bot.channels.get(channel);
        }

        const message = await channel.send(options.text ? options.text : '', options.embed ? { embed: options.embed } : null);
      
        if (!message) {
            throw new Error(`Failed to send message to channel ${channel.id}`);
        }
      
        return message;
    }      

    async function getDMChannel(id) {
        return bot.users.get(id).dmChannel;
    }

    function on(event, callback) {
        em.on(event, callback);
    }

    try {
        await bot.login(app.config.discord.token);

        return { sendToChannel, getDMChannel, on };
    } catch (error) {
        log(error);

        throw new Error('Discord Connection Error');
    }
};