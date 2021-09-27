import { Model, Sequelize, DataTypes } from 'sequelize';

export const sequelize = new Sequelize({
    dialect: 'postgres',
    database: process.env.DB_NAME,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD
});

export class Subscription extends Model {
    subId!: string;
    subType!: string;
    createdAt!: Date;
    expiresAt!: Date;
    isActive!: boolean;
    claimerDiscordGuildId!: string|null;
    claimedAt!: Date|null;

    // manual sub stuff
    modDiscordId!: string|null;

    // appstle stuff
    productId!: string|null;
};

export class AppstlePayment extends Model {
    orderId!: string;
    subId!: string;
    status!: string;
    billingDate!: Date;
};

export class FloorPriceHistory extends Model {
    slug!: string;
    createdAt!: Date;
    value!: number;
}

export class SlugSubscription extends Model {
    id!: number;
    slug!: string;
    discordUserId!: string;
    discordGuildId!: string;
    discordChannelId!: string;
    createdAt!: Date;
    isActive!: boolean;
    cancelledAt!: Date;
    updatedAt!: Date;
};

Subscription.init({
    subId: {
        type: DataTypes.STRING,
        primaryKey: true
    },
    subType: {
        type: DataTypes.STRING,
        allowNull: false
    },
    createdAt: {
        type: DataTypes.DATE,
        allowNull: false
    },
    expiresAt: {
        type: DataTypes.DATE,
        allowNull: false
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false
    },
    claimerDiscordGuildId: {
        type: DataTypes.STRING,
        allowNull: true
    },
    claimedAt: {
        type: DataTypes.DATE,
        allowNull: true
    },
    modDiscordUserId: {
        type: DataTypes.STRING,
        allowNull: true
    },
    productId: {
        type: DataTypes.STRING,
        allowNull: true
    }
}, {
    sequelize,
    tableName: 'subscriptions'
});

AppstlePayment.init({
    orderId: {
        type: DataTypes.STRING,
        primaryKey: true
    },
    subId: {
        type: DataTypes.STRING,
        allowNull: false
    },
    status: {
        type: DataTypes.STRING,
        allowNull: false
    },
    billingDate: {
        type: DataTypes.DATE,
        allowNull: false
    }
}, {
    sequelize,
    tableName: 'appstle_payments'
});

SlugSubscription.init({
    slug: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    discordGuildId: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    discordChannelId: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
    },
    cancelledAt: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    updatedAt: {
        type: DataTypes.DATE,
        allowNull: true,
    }
}, {
    sequelize,
    tableName: 'slug_subscriptions'
});

FloorPriceHistory.init({
    slug: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    value: {
        type: DataTypes.FLOAT,
        allowNull: false,
    }
}, {
    sequelize,
    tableName: 'floor_price_history'
});

if (process.argv.includes('--sync')) sequelize.sync({ force: process.argv.includes('--force') });
