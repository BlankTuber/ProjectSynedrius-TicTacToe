const { PermissionFlagsBits } = require('discord.js');
const updateConfig = require('../utils/updateConfig');

module.exports = {
    name: 'prefix',
    description: 'Change the bot prefix',
    async executeMessage(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('You need Administrator permissions to use this command.');
        }

        const newPrefix = args[0];
        if (!newPrefix) {
            return message.reply('Please provide a new prefix.');
        }

        updateConfig('prefix', newPrefix);
        await message.reply(`Prefix updated to: ${newPrefix}`);
    },
};