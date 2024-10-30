const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'help',
    description: 'Lists all available commands',
    async executeMessage(message, args) {
        const configPath = path.join(__dirname, '../config.json');
        const { prefix } = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        
        const commands = message.client.prefixCommands;
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('Available Commands')
            .setDescription(`Here are all the commands you can use with the prefix \`${prefix}\`:`);

        commands.forEach(command => {
            embed.addFields({ name: `${prefix}${command.name}`, value: command.description });
        });

        await message.reply({ embeds: [embed] });
    },
};