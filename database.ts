import { Entity, Column, PrimaryColumn, createConnection, Connection, PrimaryGeneratedColumn } from "typeorm";

export let connection: Connection;

export const initialize = () => createConnection({
    type: 'postgres',
    host: 'localhost',
    database: process.env.DB_NAME,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    entities: [Subscription, AppstlePayment, FloorPriceHistory, SlugSubscription],
    synchronize: true
}).then((createdConnection) => connection = createdConnection);

@Entity()
export class Subscription {

    @PrimaryColumn()
    subId!: string;

    @Column()
    subType!: string;

    @Column()
    createdAt!: Date;

    @Column()
    expiresAt!: Date;

    @Column()
    isActive!: boolean;

    @Column({ length: 32, nullable: true })
    claimerDiscordGuildId!: string;

    @Column({ nullable: true })
    claimedAt!: Date;

    @Column({ length: 32, nullable: true })
    // manual sub stuff
    modDiscordId!: string;

    @Column({ nullable: true })
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

    @Column()
    billingDate!: Date;
};

@Entity()
export class FloorPriceHistory {

    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    slug!: string;

    @Column()
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

    @Column({ length: 32 })
    discordUserId!: string;

    @Column({ length: 32 })
    discordGuildId!: string;

    @Column({ length: 32 })
    discordChannelId!: string;

    @Column()
    createdAt!: Date;

    @Column()
    isActive!: boolean;

    @Column()
    cancelledAt!: Date;

    @Column()
    updatedAt!: Date;
};
