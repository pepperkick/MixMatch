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

    bot.on('error', async (error) => {
        if (error.code === "ECONNRESET") {
            log("Discord socket disconnected");

            await Discord.login();
        }

        em.emit("error", error);
    });

    // Sends a message to a channel
    async function sendToChannel(channel, options) {
        if (typeof channel === String || typeof channel == "string" || typeof channel === Number) {
            channel = await bot.channels.get(channel);
        }

        const message = await channel.send(options.text ? options.text : '', options.embed ? { embed: options.embed } : null);
      
        if (!message) {
            throw new Error(`Failed to send message to channel ${channel.id}`);
        }
      
        return message;
    }      

    async function getUser(id) {
        return await bot.users.get(id);
    }

    async function getMember(guild, id) {
        return await bot.guilds.get(guild).members.get(id);
    }

    async function getDMChannel(channel_id) {
        const user = await getUser(channel_id);
        let channel = await user.dmChannel;

        if (!channel) {
            channel = await user.createDM();  
        }

        if (!channel) {
            throw new Error("Failed to get DM Channel for user", id);
        }

        return channel;
    }

    async function getGuild(guild_id) {
        const guild = await bot.guilds.get(guild_id);

        return guild;
    }

    async function getGuildChannel(guild_id, channel_id) {
        const guild = await getGuild(guild_id);
        const channel = await guild.channels.get(channel_id);

        return channel;
    }

    async function getGuildRole(guild_id, role_id) {
        const guild = await getGuild(guild_id);
        const role = await guild.roles.get(role_id);

        return role;
    }

    async function assignRole(guild_id, user_id, role_id) {
        const guild = await getGuild(guild_id);
        const member = await getMember(guild_id, user_id);
    
        if (!guild) {
            throw new Error(`Failed to find guild with id ${guild_id}`);
        }

        if (!member) {
            throw new Error(`Failed to find member with id ${user_id}`);
        }

        await member.addRole(role_id);
    }

    async function login() {
        await bot.login(app.config.discord.token);
    }

    function on(event, callback) {
        em.on(event, callback);
    }

    try {
        await login();

        return { login, sendToChannel, getDMChannel, getUser, getMember, getGuild, getGuildChannel, getGuildRole, assignRole, on, core: bot };
    } catch (error) {
        log(error);

        throw new Error('Discord Connection Error');
    }
};