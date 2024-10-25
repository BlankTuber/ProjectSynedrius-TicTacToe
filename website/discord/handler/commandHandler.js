const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
    init: async (client) => {
    // Store commands in a collection
    client.commands = new Map();
    const commands = [];
    
    // Load command file
    const commandsPath = path.join(__dirname, '../commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    
    // Load each command
    for (const file of commandFiles) {
        const command = require(`../commands/${file}`);
        
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
            commands.push(command.data.toJSON());
            console.log(`Loaded command: ${command.data.name}`);
        }
    }

    // Register slash commands with Discord
    const rest = new REST().setToken(process.env.BOT_TOKEN);
    
    try {
        console.log('Started refreshing slash commands...');
        
        await rest.put(
            Routes.applicationCommands(process.env.APPLICATION_ID),
            { body: commands },
        );
        
        console.log('Successfully registered slash commands!');
    } catch (error) {
        console.error('Error registering slash commands:', error);
    }

    // Handle incoming slash commands
    client.on('interactionCreate', async interaction => {
        if (!interaction.isChatInputCommand()) return;
        
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        
        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            await interaction.reply({ 
                content: 'There was an error executing this command!', 
                ephemeral: true 
            });
        }
    });
}};