const { Client, GatewayIntentBits, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Events } = require('discord.js');
const fs = require('fs');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers]
});

// Rollen
const allowedRoles = [
    "Two Bar", "One Bar", "Three Stripes Circle", "Two Stripe", "One Stripe"
];

// Channels
const stashChannelId = "1456489075941834949";
const depositLogChannelId = "1456726864134668359";
const withdrawLogChannelId = "1456733883021267038";

// Inventory Datei
const inventoryFile = './inventory.json';

// --- Load / Save ---
function loadInventory() {
    if (!fs.existsSync(inventoryFile)) return {};
    return JSON.parse(fs.readFileSync(inventoryFile));
}

function saveInventory(data) {
    fs.writeFileSync(inventoryFile, JSON.stringify(data, null, 2));
}

// --- ASCII MDT Board ---
function buildStashText(inventory) {
    const padItem = (name, qty) => {
        const maxLen = 17;
        const itemName = name.padEnd(maxLen, " ");
        const qtyStr = `x${qty}`.padEnd(6, " ");
        return `  - ${itemName}${qtyStr}`;
    }

    const categories = ["Weapons", "Drugs", "Materials", "Others"];
    let text = `PINKPANTHER STASH\n────────────────────────────────────────────────────────────────────\n\n`;

    for (const cat of categories) {
        text += `${cat.toUpperCase()}\n`;
        const items = inventory[cat] || {};
        if (Object.keys(items).length === 0) {
            text += `  - (Empty)\n\n`;
            continue;
        }
        for (const [itemName, qty] of Object.entries(items)) {
            text += padItem(itemName, qty) + "\n";
        }
        text += "\n";
    }

    const now = new Date();
    const dateStr = `${String(now.getDate()).padStart(2,'0')}.${String(now.getMonth()+1).padStart(2,'0')}.${now.getFullYear()}`;
    text += `────────────────────────────────────────────────────────────────────\nLast Updated: ${dateStr}\n`;

    return "```" + text + "```";
}

// --- Update Stash Board ---
async function updateInventoryMessage(channel) {
    const inventory = loadInventory();
    const stashText = buildStashText(inventory);

    try {
        const messages = await channel.messages.fetch({ limit: 50 });
        const botMsg = messages.find(m => m.author.id === client.user.id && m.content.startsWith("```PINKPANTHER STASH"));
        if (botMsg) await botMsg.edit(stashText);
        else await channel.send(stashText);
    } catch (err) {
        console.log("Error updating stash message:", err);
    }
}

// --- Modern Embed Logs ---
async function sendLog(channelId, action, user, item, qty, category) {
    const channel = await client.channels.fetch(channelId).catch(()=>null);
    if (!channel) return;

    const embed = new EmbedBuilder()
        .setTitle(action.toUpperCase())
        .setColor(action === "deposit" ? 0x2ECC71 : 0xE74C3C)
        .addFields(
            { name: "User", value: user.tag, inline: true },
            { name: "Item", value: item, inline: true },
            { name: "Quantity", value: qty.toString(), inline: true },
            { name: "Category", value: category, inline: true },
            { name: "Time", value: `<t:${Math.floor(Date.now()/1000)}:R>`, inline: true }
        );

    channel.send({ embeds: [embed] });
}

// --- Ready ---
client.once('ready', async () => {
    console.log(`✅ Gang Bot online as ${client.user.tag}`);
    const stashChannel = await client.channels.fetch(stashChannelId).catch(()=>null);
    if (stashChannel) updateInventoryMessage(stashChannel);
});

// --- Menu Command ---
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    if (!message.content.startsWith('!deposit menu') && !message.content.startsWith('!withdraw menu')) return;

    // Rollencheck
    const hasRole = message.member.roles.cache.some(r => allowedRoles.includes(r.name));
    if (!hasRole) {
        await message.reply("❌ You don’t have permission!").then(msg => setTimeout(()=>msg.delete().catch(()=>{}),4000));
        return message.delete().catch(()=>{});
    }

    const action = message.content.startsWith('!deposit') ? "deposit" : "withdraw";

    // Kategorie Dropdown
    const row = new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`selectCategory_${action}`)
                .setPlaceholder('Select Category')
                .addOptions([
                    { label: 'Weapons', value: 'Weapons' },
                    { label: 'Drugs', value: 'Drugs' },
                    { label: 'Materials', value: 'Materials' },
                    { label: 'Others', value: 'Others' },
                ])
        );

    await message.channel.send({ content: `Select category for ${action}:`, components: [row] });
    message.delete().catch(()=>{});
});

// --- Interaction Handling for Category ---
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isStringSelectMenu()) return;

    const [type, action] = interaction.customId.split('_'); // selectCategory_deposit
    if (type !== "selectCategory") return;

    const category = interaction.values[0];

    // Bot fragt Itemname im Chat
    const promptMsg = await interaction.update({ content: `Type the item name you want to ${action} in **${category}**:`, components: [] });

    const filter = m => m.author.id === interaction.user.id;
    const collector = interaction.channel.createMessageCollector({ filter, time: 30000, max: 1 });

    collector.on('collect', async m => {
        const itemName = m.content.trim();
        if (!itemName) return;

        m.delete().catch(()=>{}); // User input löschen
        if (promptMsg) setTimeout(()=> promptMsg.delete().catch(()=>{}), 2000); // Prompt löschen

        // Buttons für Menge
        const row = new ActionRowBuilder()
            .addComponents([
                new ButtonBuilder().setCustomId(`qty1_${action}_${category}_${itemName}`).setLabel('1').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`qty5_${action}_${category}_${itemName}`).setLabel('5').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`qty10_${action}_${category}_${itemName}`).setLabel('10').setStyle(ButtonStyle.Primary),
            ]);

        await interaction.channel.send({ content: `Select quantity for **${itemName}**:`, components: [row] });
    });
});

// --- Button Handling for Quantity ---
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;

    const [qtyStr, action, category, item] = interaction.customId.split('_');
    const qty = parseInt(qtyStr.replace('qty',''));

    const inventory = loadInventory();
    if (!inventory[category]) inventory[category] = {};
    if (!inventory[category][item]) inventory[category][item] = 0;

    if (action === 'deposit') inventory[category][item] += qty;
    else if (action === 'withdraw') {
        if (!inventory[category][item] || inventory[category][item] < qty) {
            return interaction.reply({ content:"❌ Not enough items!", ephemeral:true });
        }
        inventory[category][item] -= qty;
        if (inventory[category][item] === 0) delete inventory[category][item];
    }

    saveInventory(inventory);

    // Update Stash Board
    const stashChannel = await client.channels.fetch(stashChannelId).catch(()=>null);
    if (stashChannel) updateInventoryMessage(stashChannel);

    // Send Log
    const logChannelId = action === 'deposit' ? depositLogChannelId : withdrawLogChannelId;
    sendLog(logChannelId, action, interaction.user, item, qty, category);

    // Ephemeral Bestätigung
    await interaction.update({ content: `✅ ${action} ${qty}x ${item} (${category}) successful!`, components: [] });
});

// --- Login ---
client.login(process.env.TOKEN);
