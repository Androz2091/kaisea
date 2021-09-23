import fastify from 'fastify';
import { AppstlePayment, Subscription } from './database';
import client from './';
import { MessageEmbed, TextChannel } from 'discord.js';

const server = fastify();

interface AuthenticatedWebhookQuery {
    key: string;
}

interface SubscriptionCreatedPayload {
    createdAt: string;
    nextBillingDate: string;
    orderID: string;
    productID: string;
    subID: string;
    customerEmail: string;
    customerPaypalEmail: string;
    customerName: string;
    customerData: string;
    orderName: string;
}

const products = [
    {
        type: 'year',
        id: '378738933',
        price: 78,
        days: 370
    },
    {
        type: 'month',
        id: '39088393',
        price: 8,
        days: 31
    }
]

server.post('/subscription-created', async (request, reply) => {
    if ((request.query as AuthenticatedWebhookQuery)?.key !== process.env.ZAPIER_AUTH_KEY) {
        return reply.code(401).send({
            message: 'Can not verify request'
        });
    }

    const data = request.body as SubscriptionCreatedPayload;

    console.log(data);

    const subId = data.subID.match(/gid:\/\/shopify\/SubscriptionContract\/([0-9]+)/)![1];
    const productId = data.productID.match(/gid:\/\/shopify\/Product\/([0-9]+)/)![1];
    const createdAt = new Date(data.createdAt);
    const nextBillingDate = new Date(data.nextBillingDate);

    const product = products.find((product) => product.id === productId)!;

    Subscription.create({
        subId,
        subType: 'appstle',
        createdAt,
        expiresAt: new Date(nextBillingDate.getTime() + (product.days * 24 * 60 * 60 * 1000)),
        isActive: true,
        productId,
        claimerDiscordGuildId: null,
        claimedAt: null
    }).catch((err) => {
        console.error(err);
    }).finally(() => {
        const embed = new MessageEmbed()
            .setAuthor('New subscription created 🎉')
            .addField('Subscription type', product.type)
            .addField('Subscription price', product.price + '€')
            .addField('Next billing date', nextBillingDate.toLocaleString('fr-FR'))
            .addField('Email', data.customerEmail)
            .addField('Email PayPal', data.customerPaypalEmail)
            .addField('Customer name', data.customerName)
            .addField('Customer location', data.customerData)
            .addField('Subscription ID', subId)
            .addField('Order ID', data.orderName)
            .setTimestamp()
            .setColor('DARK_GREEN');
        (client.channels.cache.get(process.env.PAYMENT_LOGS!) as TextChannel).send({ embeds: [embed] });

        reply.send(200);
    });
});

interface OrderPlacedPayload {
    orderID: string;
    orderName: string;
    subID: string;
    status: string;
};
server.post('/order-placed', async (request, reply) => {
    if ((request.query as AuthenticatedWebhookQuery)?.key !== process.env.ZAPIER_AUTH_KEY) {
        return reply.code(401).send({
            message: 'Can not verify request'
        });
    }

    const data = request.body as OrderPlacedPayload;

    const orderId = data.orderID;
    const subId = data.subID;
    const status = data.status;

    if (status !== 'SUCCESS') {
        return void reply.send(200);
    };

    const subscription = await Subscription.findOne({
        where: {
            subId
        }
    });

    if (subscription) {
        subscription.expiresAt = new Date(subscription.expiresAt.getTime() + (32 * 24 * 60 * 60 * 1000));
        await subscription.save();
    }

    AppstlePayment.create({
        orderId,
        subId,
        status,
        billindDate: new Date()
    }).catch((e) => {
        console.error(e);
    }).finally(() => {
        const product = products.find((product) => product.id === subscription?.productId)!;
        const embed = new MessageEmbed()
            .setAuthor('New payment received ✅')
            .addField('Subscription', product.type!)
            .addField('Payment price', `${product.price.toFixed(2)}€`)
            .addField('Order Name', data.orderName)
            .addField('Server ID', subscription?.claimerDiscordGuildId ? `<@${subscription.claimerDiscordGuildId}> (${subscription.claimerDiscordGuildId})` : 'Aucun ID Discord relié')
            .setFooter(`Sub ID: ${subId} | Order ID: ${orderId}`)
            .setTimestamp()
            .setColor('DARK_ORANGE');
        (client.channels.cache.get(process.env.PAYMENT_LOGS!) as TextChannel).send({ embeds: [embed] });

        reply.send(200);
    });
});

interface SubscriptionUpdatedPayload {
    subID: string;
    status: string;
};

server.post('/subscription-updated', async (request, reply) => {
    if ((request.query as AuthenticatedWebhookQuery)?.key !== process.env.ZAPIER_AUTH_KEY) {
        return reply.code(401).send({
            message: 'Can not verify request'
        });
    }

    const data = request.body as SubscriptionUpdatedPayload;

    console.log(data);

    const subId = data.subID.match(/gid:\/\/shopify\/SubscriptionContract\/([0-9]+)/)![1];
    const status = data.status;

    const subscription = await Subscription.findOne({
        where: {
            subId
        }
    });

    if (subscription?.isActive && status === 'CANCELLED') {
        subscription.isActive = false;
        await subscription.save();

        const product = products.find((product) => product.id === subscription.productId)!;

        const embed = new MessageEmbed()
            .setAuthor('Subscription cancelled 👋')
            .addField('Subscription type', product.type!)
            .addField('Subscription price', `${product.price.toFixed(2)}€`)
            .addField('Server ID', subscription?.claimerDiscordGuildId ? `<@${subscription.claimerDiscordGuildId}> (${subscription.claimerDiscordGuildId})` : 'Aucun ID Discord relié')
            .setTimestamp()
            .setColor('DARK_GREY');
        (client.channels.cache.get(process.env.PAYMENT_LOGS!) as TextChannel).send({ embeds: [embed] });
    };


    reply.send(200);
});

server.listen(process.env.API_PORT!, (err, address) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    console.log(`Server listening at ${address}`);
});