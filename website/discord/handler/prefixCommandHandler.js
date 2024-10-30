module.exports = {
    init: (client) => {
        const prefix = '!'; // Choose your preferred prefix
        client.on('messageCreate', async message => {
            if (message.author.bot || !message.content.startsWith(prefix)) return;

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