
const { Client, GatewayIntentBits, EmbedBuilder, ActivityType } = require('discord.js');
const { OpenAI } = require('openai');
const config = require('./config.json');

// Initialize Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ]
});

// Initialize OpenAI client
let openai = null;
if (config.OpenAiApiKey) {
    openai = new OpenAI({
        apiKey: config.OpenAiApiKey
    });
}

// Bot ready event
client.once('ready', () => {
    console.log(`✅ ${client.user.tag} is online!`);
    
    // Set bot status and activity
    client.user.setStatus(config.setStatus);
    client.user.setActivity(config.setActivity, { type: ActivityType.Playing });
});

// Message handler
client.on('messageCreate', async (message) => {
    // Ignore bot messages
    if (message.author.bot) return;

    // OpenAI chatbot functionality
    if (config.ChannelOpenAi && message.channel.id === config.ChannelOpenAi) {
        if (!openai) {
            const errorEmbed = new EmbedBuilder()
                .setColor(config.errorColor)
                .setTitle('❌ Error')
                .setDescription('OpenAI API key is not configured!');
            
            return message.reply({ embeds: [errorEmbed] });
        }

        try {
            // Show typing indicator
            await message.channel.sendTyping();

            const response = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "user",
                        content: message.content
                    }
                ],
                max_tokens: 1000
            });

            const aiResponse = response.choices[0].message.content;

            const successEmbed = new EmbedBuilder()
                .setColor(config.successColor)
                .setTitle('🤖 AI Response')
                .setDescription(aiResponse)
                .setFooter({ text: `Requested by ${message.author.tag}` })
                .setTimestamp();

            await message.reply({ embeds: [successEmbed] });

        } catch (error) {
            console.error('OpenAI Error:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setColor(config.errorColor)
                .setTitle('❌ AI Error')
                .setDescription('Failed to get AI response. Please try again later.');
            
            await message.reply({ embeds: [errorEmbed] });
        }
    }

    
});

// Error handling
client.on('error', error => {
    console.error('Discord client error:', error);
});

process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

// Login to Discord
if (!config.token) {
    console.error('❌ Discord token is missing! Please add it to config.json');
    process.exit(1);
}

client.login(config.token);
