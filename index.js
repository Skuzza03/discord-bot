const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const fs = require('fs');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// --- Rollen ---
const allowedRoles = [
    "Two Bar", "One Bar", "Three Stripes Circle", "Two Stripe", "One Stripe"
];

// --- Channels ---
const stashChannelId = "1456489075941834949";
const depositLogChannelId = "1456726864134668359";
const withdrawLogChannelId = "1456733883021267038";

// --- Inventory Datei ---
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

// --- Logs ---
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

// --- Commands ---
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    if (!message.content.startsWith('!deposit') && !message.content.startsWith('!withdraw')) return;

    const action = message.content.startsWith('!deposit') ? 'deposit' : 'withdraw';

    // Rollencheck
    const hasRole = message.member.roles.cache.some(r => allowedRoles.includes(r.name));
    if (!hasRole) {
        await message.reply({ content: "❌ You don’t have permission!", ephemeral: true }).then(msg => setTimeout(()=>msg.delete().catch(()=>{}),4000));
        return message.delete().catch(()=>{});
    }

    const args = message.content.split(' ').slice(1);
    if (args.length < 2) {
        await message.reply({ content: `Usage: !${action} <item> <quantity> (<category>)`, ephemeral: true });
        return message.delete().catch(()=>{});
    }

    let item = args[0];
    let qty = parseInt(args[1]);
    if (isNaN(qty) || qty <= 0) {
        await message.reply({ content: "❌ Invalid quantity!", ephemeral: true });
        return message.delete().catch(()=>{});
    }

    let category = args[2] || 'Others';
    category = category.replace(/[()]/g,''); 
    const validCategories = ["Weapons","Drugs","Materials","Others"];
    if (!validCategories.includes(category)) category = 'Others';

    // Inventory update
    const inventory = loadInventory();
    if (!inventory[category]) inventory[category] = {};
    if (!inventory[category][item]) inventory[category][item] = 0;

    if (action === 'deposit') inventory[category][item] += qty;
    else {
        if (inventory[category][item] < qty) {
            await message.reply({ content: "❌ Not enough items!", ephemeral:true });
            return message.delete().catch(()=>{});
        }
        inventory[category][item] -= qty;
        if (inventory[category][item] === 0) delete inventory[category][item];
    }

    saveInventory(inventory);

    const stashChannel = await client.channels.fetch(stashChannelId).catch(()=>null);
    if (stashChannel) updateInventoryMessage(stashChannel);

    const logChannelId = action === 'deposit' ? depositLogChannelId : withdrawLogChannelId;
    sendLog(logChannelId, action, message.author, item, qty, category);

    // ephemeral success
    await message.reply({ content: `✅ ${action} ${qty}x ${item} (${category}) successful!`, ephemeral:true });
    message.delete().catch(()=>{});
});

// --- Login ---
client.login(process.env.TOKEN);
