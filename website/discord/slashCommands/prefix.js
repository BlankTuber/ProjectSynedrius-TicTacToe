const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const updateConfig = require('../utils/updateConfig');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('prefix')
        .setDescription('Change the bot prefix')
        .addStringOption(option =>
            option.setName('newprefix')
                .setDescription('The new prefix to use')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        const newPrefix = interaction.options.getString('newprefix');
        updateConfig('prefix', newPrefix);
        await interaction.reply(`Prefix updated to: ${newPrefix}`);
    },
};