const fs = require('fs');
const path = require('path');

module.exports = {
    init: (client) => {
        client.on('messageCreate', async message => {
            if (message.author.bot) return;

            // Read the current prefix from config
            const configPath = path.join(__dirname, '../config.json');
            const { prefix } = JSON.parse(fs.readFileSync(configPath, 'utf8'));

            if (!message.content.startsWith(prefix)) return;

            const args = message.content.slice(prefix.length).trim().split(/ +/);
            const commandName = args.shift().toLowerCase();

            const command = client.prefixCommands.get(commandName);
            if (!command) return;

            try {
                await command.executeMessage(message, args);
            } catch (error) {
                console.error(error);
                await message.reply('There was an error executing this command!');
            }
        });
    }
};