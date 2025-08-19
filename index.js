
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const axios = require('axios');
const fs = require('fs');
const config = require('./config.json');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// Data persistence functions
function loadData() {
  try {
    if (fs.existsSync('./data.json')) {
      const data = JSON.parse(fs.readFileSync('./data.json', 'utf8'));
      return {
        openaiChannels: new Map(Object.entries(data.openaiChannels || {})),
        blacklistedUsers: new Set(data.blacklistedUsers || []),
        blacklistedServers: new Set(data.blacklistedServers || [])
      };
    }
  } catch (error) {
    console.error('Error loading data:', error);
  }
  
  // Return default empty data if file doesn't exist or error occurred
  return {
    openaiChannels: new Map(),
    blacklistedUsers: new Set(),
    blacklistedServers: new Set()
  };
}

function saveData() {
  try {
    const data = {
      blacklistedUsers: Array.from(blacklistedUsers),
      blacklistedServers: Array.from(blacklistedServers),
      openaiChannels: Object.fromEntries(openaiChannels)
    };
    fs.writeFileSync('./data.json', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving data:', error);
  }
}

// Load data from file
const loadedData = loadData();
let openaiChannels = loadedData.openaiChannels;
let blacklistedUsers = loadedData.blacklistedUsers;
let blacklistedServers = loadedData.blacklistedServers;

// Bot start time for uptime calculation
const startTime = Date.now();

// Slash commands
const commands = [
  new SlashCommandBuilder()
    .setName('channel')
    .setDescription('Manage OpenAI channels')
    .addSubcommandGroup(group =>
      group
        .setName('openai')
        .setDescription('OpenAI channel management')
        .addSubcommand(subcommand =>
          subcommand
            .setName('setup')
            .setDescription('Setup OpenAI in a channel')
            .addChannelOption(option => option.setName('channel').setDescription('Channel to setup').setRequired(true))
        )
        .addSubcommand(subcommand =>
          subcommand
            .setName('remove')
            .setDescription('Remove OpenAI from a channel')
            .addChannelOption(option => option.setName('channel').setDescription('Channel to remove').setRequired(true))
        )
        .addSubcommand(subcommand =>
          subcommand
            .setName('settings')
            .setDescription('View OpenAI settings for the server')
        )
    ),

  new SlashCommandBuilder()
    .setName('blacklist')
    .setDescription('Manage blacklists')
    .addSubcommandGroup(group =>
      group
        .setName('user')
        .setDescription('User blacklist management')
        .addSubcommand(subcommand =>
          subcommand
            .setName('add')
            .setDescription('Add user to blacklist')
            .addUserOption(option => option.setName('user').setDescription('User to blacklist').setRequired(false))
            .addStringOption(option => option.setName('userid').setDescription('User ID to blacklist').setRequired(false))
        )
        .addSubcommand(subcommand =>
          subcommand
            .setName('remove')
            .setDescription('Remove user from blacklist')
            .addUserOption(option => option.setName('user').setDescription('User to remove from blacklist').setRequired(true))
        )
        .addSubcommand(subcommand =>
          subcommand
            .setName('list')
            .setDescription('List blacklisted users')
        )
    )
    .addSubcommandGroup(group =>
      group
        .setName('server')
        .setDescription('Server blacklist management')
        .addSubcommand(subcommand =>
          subcommand
            .setName('add')
            .setDescription('Add server to blacklist')
            .addStringOption(option => option.setName('serverid').setDescription('Server ID to blacklist').setRequired(true))
        )
        .addSubcommand(subcommand =>
          subcommand
            .setName('remove')
            .setDescription('Remove server from blacklist')
            .addStringOption(option => option.setName('serverid').setDescription('Server ID to remove from blacklist').setRequired(true))
        )
        .addSubcommand(subcommand =>
          subcommand
            .setName('list')
            .setDescription('List blacklisted servers')
        )
    ),

  new SlashCommandBuilder()
    .setName('bot')
    .setDescription('Bot commands')
    .addSubcommand(subcommand =>
      subcommand
        .setName('info')
        .setDescription('Bot information')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('help')
        .setDescription('Help menu')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('uptime')
        .setDescription('Bot uptime')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('ping')
        .setDescription('Bot latency')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('invite')
        .setDescription('Get bot invite link')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('feedback')
        .setDescription('Send feedback')
        .addStringOption(option => option.setName('message').setDescription('Your feedback message').setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('serverlist')
        .setDescription('List servers (Owner only)')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('leave')
        .setDescription('Leave a server (Owner only)')
        .addStringOption(option => option.setName('serverid').setDescription('Server ID to leave').setRequired(true))
    )
];

// Register slash commands
const rest = new REST({ version: '10' }).setToken(config.token);

async function deployCommands() {
  try {
    console.log('Started refreshing application (/) commands.');
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
}

// OpenAI API call function
async function callOpenAI(conversationLog) {
  try {
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o-mini',
      messages: conversationLog,
      max_tokens: 1000
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.openAiApiKey}`
      }
    });

    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('OpenAI API Error:', error.response?.data || error.message);
    throw error;
  }
}

// Helper functions
function createEmbed(title, description, color = config.successColor) {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setTimestamp();
}

function formatUptime(uptime) {
  const days = Math.floor(uptime / (24 * 60 * 60 * 1000));
  const hours = Math.floor((uptime % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((uptime % (60 * 60 * 1000)) / (60 * 1000));
  const seconds = Math.floor((uptime % (60 * 1000)) / 1000);
  
  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

// Event handlers
client.on('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  client.user.setStatus(config.setStatus);
  client.user.setActivity(config.setActivity);
  await deployCommands();
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // Check if server is blacklisted
  if (blacklistedServers.has(interaction.guildId)) {
    return await interaction.reply({ content: 'This server is blacklisted.', ephemeral: true });
  }

  // Check if user is blacklisted
  if (blacklistedUsers.has(interaction.user.id)) {
    return await interaction.reply({ content: 'You are blacklisted.', ephemeral: true });
  }

  const { commandName } = interaction;

  try {
    if (commandName === 'channel') {
      const group = interaction.options.getSubcommandGroup();
      const subcommand = interaction.options.getSubcommand();

      if (group === 'openai') {
        // Check permissions
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
          return await interaction.reply({ content: 'You need Manage Channels permission to use this command.', ephemeral: true });
        }

        if (subcommand === 'setup') {
          const channel = interaction.options.getChannel('channel');
          openaiChannels.set(channel.id, interaction.guildId);
          saveData();
          const embed = createEmbed('OpenAI Setup', `OpenAI has been set up in ${channel}`);
          await interaction.reply({ embeds: [embed] });
        } else if (subcommand === 'remove') {
          const channel = interaction.options.getChannel('channel');
          openaiChannels.delete(channel.id);
          saveData();
          const embed = createEmbed('OpenAI Removed', `OpenAI has been removed from ${channel}`);
          await interaction.reply({ embeds: [embed] });
        } else if (subcommand === 'settings') {
          const serverChannels = Array.from(openaiChannels.entries())
            .filter(([channelId, guildId]) => guildId === interaction.guildId)
            .map(([channelId]) => `<#${channelId}>`)
            .join('\n') || 'No channels configured';
          
          const embed = createEmbed('OpenAI Settings', `**Configured Channels:**\n${serverChannels}`);
          await interaction.reply({ embeds: [embed] });
        }
      }
    } else if (commandName === 'blacklist') {
      // Only bot owner can manage blacklists
      if (interaction.user.id !== config.ownerId) {
        return await interaction.reply({ content: 'Only the bot owner can manage blacklists.', ephemeral: true });
      }

      const group = interaction.options.getSubcommandGroup();
      const subcommand = interaction.options.getSubcommand();

      if (group === 'user') {
        if (subcommand === 'add') {
          const user = interaction.options.getUser('user');
          const userid = interaction.options.getString('userid');
          
          if (!user && !userid) {
            const embed = createEmbed('Error', 'Please provide either a user mention or user ID.', config.errorColor);
            return await interaction.reply({ embeds: [embed], ephemeral: true });
          }
          
          let targetUserId, targetUserTag;
          
          if (user) {
            targetUserId = user.id;
            targetUserTag = user.tag;
          } else {
            targetUserId = userid;
            try {
              const fetchedUser = await client.users.fetch(userid);
              targetUserTag = fetchedUser.tag;
            } catch (error) {
              targetUserTag = `User ID: ${userid}`;
            }
          }
          
          blacklistedUsers.add(targetUserId);
          saveData();
          const embed = createEmbed('User Blacklisted', `${targetUserTag} has been blacklisted.`);
          await interaction.reply({ embeds: [embed] });
        } else if (subcommand === 'remove') {
          const user = interaction.options.getUser('user');
          blacklistedUsers.delete(user.id);
          saveData();
          const embed = createEmbed('User Unblacklisted', `${user.tag} has been removed from blacklist.`);
          await interaction.reply({ embeds: [embed] });
        } else if (subcommand === 'list') {
          const users = Array.from(blacklistedUsers).map(id => `<@${id}>`).join('\n') || 'No blacklisted users';
          const embed = createEmbed('Blacklisted Users', users);
          await interaction.reply({ embeds: [embed] });
        }
      } else if (group === 'server') {
        if (subcommand === 'add') {
          const serverId = interaction.options.getString('serverid');
          blacklistedServers.add(serverId);
          saveData();
          const embed = createEmbed('Server Blacklisted', `Server ID: ${serverId} has been blacklisted.`);
          await interaction.reply({ embeds: [embed] });
        } else if (subcommand === 'remove') {
          const serverId = interaction.options.getString('serverid');
          blacklistedServers.delete(serverId);
          saveData();
          const embed = createEmbed('Server Unblacklisted', `Server ID: ${serverId} has been removed from blacklist.`);
          await interaction.reply({ embeds: [embed] });
        } else if (subcommand === 'list') {
          const servers = Array.from(blacklistedServers).join('\n') || 'No blacklisted servers';
          const embed = createEmbed('Blacklisted Servers', servers);
          await interaction.reply({ embeds: [embed] });
        }
      }
    } else if (commandName === 'bot') {
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'info') {
        const embed = createEmbed('Bot Information', 
          `**Bot Name:** ${client.user.tag}\n` +
          `**Bot ID:** ${client.user.id}\n` +
          `**Servers:** ${client.guilds.cache.size}\n` +
          `**Users:** ${client.users.cache.size}\n` +
          `**Uptime:** ${formatUptime(Date.now() - startTime)}`
        );
        await interaction.reply({ embeds: [embed] });
      } else if (subcommand === 'help') {
        const embed = createEmbed('Help Menu',
          `**Channel Commands:**\n` +
          `\`/channel openai setup\` - Setup OpenAI in a channel\n` +
          `\`/channel openai remove\` - Remove OpenAI from a channel\n` +
          `\`/channel openai settings\` - View OpenAI settings\n\n` +
          `**Blacklist Commands:**\n` +
          `\`/blacklist user add\` - Add user to blacklist\n` +
          `\`/blacklist user remove\` - Remove user from blacklist\n` +
          `\`/blacklist user list\` - List blacklisted users\n` +
          `\`/blacklist server add\` - Add server to blacklist\n` +
          `\`/blacklist server remove\` - Remove server from blacklist\n` +
          `\`/blacklist server list\` - List blacklisted servers\n\n` +
          `**Bot Commands:**\n` +
          `\`/bot info\` - Bot information\n` +
          `\`/bot help\` - This help menu\n` +
          `\`/bot uptime\` - Bot uptime\n` +
          `\`/bot ping\` - Bot latency\n` +
          `\`/bot invite\` - Get invite link\n` +
          `\`/bot feedback\` - Send feedback\n` +
          `\`/bot serverlist\` - List servers (Owner only)\n` +
          `\`/bot leave\` - Leave server (Owner only)`
        );
        await interaction.reply({ embeds: [embed] });
      } else if (subcommand === 'uptime') {
        const embed = createEmbed('Bot Uptime', formatUptime(Date.now() - startTime));
        await interaction.reply({ embeds: [embed] });
      } else if (subcommand === 'ping') {
        const embed = createEmbed('Bot Latency', `${client.ws.ping}ms`);
        await interaction.reply({ embeds: [embed] });
      } else if (subcommand === 'invite') {
        const invite = `https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`;
        const embed = createEmbed('Bot Invite', `[Click here to invite the bot](${invite})`);
        await interaction.reply({ embeds: [embed] });
      } else if (subcommand === 'feedback') {
        const message = interaction.options.getString('message');
        try {
          const feedbackChannel = await client.channels.fetch(config.feedBackChannel);
          const embed = createEmbed('New Feedback',
            `**From:** ${interaction.user.tag} (${interaction.user.id})\n` +
            `**Server:** ${interaction.guild.name} (${interaction.guild.id})\n` +
            `**Message:** ${message}`
          );
          await feedbackChannel.send({ embeds: [embed] });
          await interaction.reply({ content: 'Feedback sent successfully!', ephemeral: true });
        } catch (error) {
          await interaction.reply({ content: 'Failed to send feedback.', ephemeral: true });
        }
      } else if (subcommand === 'serverlist') {
        if (interaction.user.id !== config.ownerId) {
          return await interaction.reply({ content: 'Only the bot owner can use this command.', ephemeral: true });
        }
        
        const servers = client.guilds.cache.map(guild => 
          `**${guild.name}**\nID: ${guild.id}\nOwner: <@${guild.ownerId}>\nMembers: ${guild.memberCount}`
        ).join('\n\n');
        
        const embed = createEmbed('Server List', servers || 'No servers');
        await interaction.reply({ embeds: [embed], ephemeral: true });
      } else if (subcommand === 'leave') {
        if (interaction.user.id !== config.ownerId) {
          return await interaction.reply({ content: 'Only the bot owner can use this command.', ephemeral: true });
        }
        
        const serverId = interaction.options.getString('serverid');
        try {
          const guild = await client.guilds.fetch(serverId);
          await guild.leave();
          const embed = createEmbed('Left Server', `Successfully left ${guild.name}`);
          await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (error) {
          const embed = createEmbed('Error', 'Failed to leave server', config.errorColor);
          await interaction.reply({ embeds: [embed], ephemeral: true });
        }
      }
    }
  } catch (error) {
    console.error('Command error:', error);
    const embed = createEmbed('Error', 'An error occurred while executing this command.', config.errorColor);
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
});

// Message handler for OpenAI chat
// Guild leave handler - cleanup OpenAI configurations
client.on('guildDelete', async (guild) => {
  console.log(`Left guild: ${guild.name} (${guild.id})`);
  
  // Remove all OpenAI channel configurations for this guild
  let removedCount = 0;
  for (const [channelId, guildId] of openaiChannels.entries()) {
    if (guildId === guild.id) {
      openaiChannels.delete(channelId);
      removedCount++;
    }
  }
  
  if (removedCount > 0) {
    saveData();
    console.log(`Cleaned up ${removedCount} OpenAI channel configurations from guild ${guild.id}`);
  }
});

// Channel delete handler - cleanup OpenAI configuration
client.on('channelDelete', async (channel) => {
  if (openaiChannels.has(channel.id)) {
    openaiChannels.delete(channel.id);
    saveData();
    console.log(`Cleaned up OpenAI configuration for deleted channel ${channel.id}`);
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!openaiChannels.has(message.channel.id)) return;
  if (message.content.startsWith('!')) return;
  if (blacklistedUsers.has(message.author.id)) return;
  if (blacklistedServers.has(message.guildId)) return;

  let conversationLog = [
    { role: 'system', content: 'You are a friendly chatbot.' },
  ];

  try {
    await message.channel.sendTyping();
    let prevMessages = await message.channel.messages.fetch({ limit: 15 });
    prevMessages.reverse();
    
    prevMessages.forEach((msg) => {
      if (msg.content.startsWith('!')) return;
      if (msg.author.id !== client.user.id && msg.author.bot) return;
      if (msg.author.id == client.user.id) {
        conversationLog.push({
          role: 'assistant',
          content: msg.content,
          name: msg.author.username
            .replace(/\s+/g, '_')
            .replace(/[^\w\s]/gi, ''),
        });
      }

      if (msg.author.id == message.author.id) {
        conversationLog.push({
          role: 'user',
          content: msg.content,
          name: message.author.username
            .replace(/\s+/g, '_')
            .replace(/[^\w\s]/gi, ''),
        });
      }
    });

    const result = await callOpenAI(conversationLog);
    
    // Truncate response if it's too long (Discord limit is 2000 characters)
    let responseText = result;
    if (responseText.length > 2000) {
      responseText = responseText.substring(0, 1997) + '...';
    }

    message.reply(responseText);
  } catch (error) {
    console.log(`ERR: ${error}`);
    message.reply('Sorry, I encountered an error while processing your message.');
  }
});

client.login(config.token);
