module.exports = {
    name: 'ping',
    description: 'Replies with Pong!',
    async executeMessage(message, args) {
        const sent = await message.channel.send('Pinging...');
        const latency = sent.createdTimestamp - message.createdTimestamp;
        
        await sent.edit(`Pong! 🏓\nLatency: ${latency}ms\nAPI Latency: ${message.client.ws.ping}ms`);
    }
};