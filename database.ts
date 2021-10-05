import { Entity, Column, PrimaryColumn, createConnection, Connection, PrimaryGeneratedColumn } from "typeorm";

export let connection: Connection;

export const initialize = () => createConnection({
    type: 'postgres',
    host: 'localhost',
    database: process.env.DB_NAME,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    entities: [Subscription, AppstlePayment, FloorPriceHistory, SlugSubscription],
    synchronize: process.env.ENVIRONMENT === 'development',
}).then((createdConnection) => connection = createdConnection);

@Entity()
export class Subscription {

    @PrimaryColumn()
    subId!: string;

    @Column()
    subType!: string;

    @Column({
        default: new Date(),
        type: 'timestamp with time zone'
    })
    createdAt!: Date;

    @Column({
        type: 'timestamp with time zone'
    })
    expiresAt!: Date;

    @Column()
    isActive!: boolean;

    @Column({
        length: 32,
        nullable: true
    })
    claimerDiscordGuildId!: string;

    @Column({
        nullable: true,
        type: 'timestamp with time zone'
    })
    claimedAt!: Date;

    @Column({
        length: 32,
        nullable: true
    })
    // manual sub stuff
    modDiscordId!: string;

    @Column({
        nullable: true
    })
    // appstle stuff
    productId!: string;

}

@Entity()
export class AppstlePayment {

    @PrimaryColumn()
    orderId!: string;

    @Column()
    subId!: string;

    @Column()
    status!: string;

    @Column({
        type: 'timestamp with time zone'
    })
    billingDate!: Date;
};

@Entity()
export class FloorPriceHistory {

    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    slug!: string;

    @Column({
        default: new Date(),
        type: 'timestamp with time zone'
    })
    createdAt!: Date;

    @Column()
    value!: number;
}

@Entity()
export class SlugSubscription {

    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    slug!: string;

    @Column({
        length: 32
    })
    discordUserId!: string;

    @Column({
        length: 32
    })
    discordGuildId!: string;

    @Column({
        length: 32
    })
    discordChannelId!: string;

    @Column()
    isActive!: boolean;

    @Column({
        nullable: true,
        type: 'timestamp with time zone'
    })
    cancelledAt!: Date;

    @Column({
        default: new Date(),
        type: 'timestamp with time zone'
    })
    createdAt!: Date;

    @Column({
        default: new Date(),
        type: 'timestamp with time zone'
    })
    updatedAt!: Date;
};
