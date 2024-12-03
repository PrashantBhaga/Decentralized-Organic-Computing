import { EventEmitter } from 'events';
import WebSocket from 'ws';

export interface Message {
    id: string;
    type: MessageType;
    sender: string;
    recipient: string;
    payload: any;
    timestamp: number;
    signature?: string;
}

export enum MessageType {
    RESOURCE_REQUEST = 'RESOURCE_REQUEST',
    RESOURCE_RESPONSE = 'RESOURCE_RESPONSE',
    DATA_SHARE = 'DATA_SHARE',
    PATTERN_UPDATE = 'PATTERN_UPDATE',
    CONSENSUS_REQUEST = 'CONSENSUS_REQUEST',
    NODE_DISCOVERY = 'NODE_DISCOVERY'
}

export interface NetworkConfig {
    port: number;
    maxConnections: number;
    discoveryInterval: number;
    heartbeatInterval: number;
}

export class NetworkManager extends EventEmitter {
    private server: WebSocket.Server;
    private connections: Map<string, WebSocket>;
    private config: NetworkConfig;
    private heartbeatIntervals: Map<string, NodeJS.Timeout>;

    constructor(config: NetworkConfig) {
        super();
        this.config = config;
        this.connections = new Map();
        this.heartbeatIntervals = new Map();
        this.server = new WebSocket.Server({ port: config.port });
        this.setupServer();
    }

    private setupServer(): void {
        this.server.on('connection', (ws: WebSocket) => {
            const nodeId = this.generateNodeId();
            this.handleConnection(nodeId, ws);
        });

        this.server.on('error', (error: Error) => {
            this.emit('error', error);
        });
    }

    private handleConnection(nodeId: string, ws: WebSocket): void {
        if (this.connections.size >= this.config.maxConnections) {
            ws.close(1013, 'Maximum connections reached');
            return;
        }

        this.connections.set(nodeId, ws);
        this.setupHeartbeat(nodeId, ws);

        ws.on('message', (data: WebSocket.Data) => {
            this.handleMessage(nodeId, data);
        });

        ws.on('close', () => {
            this.handleDisconnection(nodeId);
        });

        ws.on('error', (error: Error) => {
            this.emit('error', { nodeId, error });
        });

        this.emit('nodeConnected', nodeId);
    }

    private setupHeartbeat(nodeId: string, ws: WebSocket): void {
        const interval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.ping();
            } else {
                this.handleDisconnection(nodeId);
            }
        }, this.config.heartbeatInterval);

        this.heartbeatIntervals.set(nodeId, interval);
    }

    private handleDisconnection(nodeId: string): void {
        const interval = this.heartbeatIntervals.get(nodeId);
        if (interval) {
            clearInterval(interval);
            this.heartbeatIntervals.delete(nodeId);
        }

        this.connections.delete(nodeId);
        this.emit('nodeDisconnected', nodeId);
    }

    private handleMessage(nodeId: string, data: WebSocket.Data): void {
        try {
            const message: Message = JSON.parse(data.toString());
            
            // Validate message
            if (!this.validateMessage(message)) {
                throw new Error('Invalid message format');
            }

            // Process message based on type
            switch (message.type) {
                case MessageType.RESOURCE_REQUEST:
                    this.handleResourceRequest(message);
                    break;
                case MessageType.DATA_SHARE:
                    this.handleDataShare(message);
                    break;
                case MessageType.PATTERN_UPDATE:
                    this.handlePatternUpdate(message);
                    break;
                case MessageType.CONSENSUS_REQUEST:
                    this.handleConsensusRequest(message);
                    break;
                case MessageType.NODE_DISCOVERY:
                    this.handleNodeDiscovery(message);
                    break;
                default:
                    this.emit('unknownMessageType', message);
            }

            this.emit('messageReceived', { nodeId, message });
        } catch (error) {
            this.emit('error', { nodeId, error, data });
        }
    }

    private validateMessage(message: Message): boolean {
        return (
            message.id &&
            message.type &&
            message.sender &&
            message.recipient &&
            message.timestamp &&
            message.timestamp <= Date.now()
        );
    }

    public async sendMessage(message: Message): Promise<boolean> {
        const connection = this.connections.get(message.recipient);
        if (!connection || connection.readyState !== WebSocket.OPEN) {
            return false;
        }

        try {
            connection.send(JSON.stringify(message));
            this.emit('messageSent', message);
            return true;
        } catch (error) {
            this.emit('error', { message, error });
            return false;
        }
    }

    public broadcast(message: Omit<Message, 'recipient'>): void {
        this.connections.forEach((connection, nodeId) => {
            if (connection.readyState === WebSocket.OPEN) {
                const broadcastMessage: Message = {
                    ...message,
                    recipient: nodeId
                };
                connection.send(JSON.stringify(broadcastMessage));
            }
        });
        this.emit('messageBroadcast', message);
    }

    private handleResourceRequest(message: Message): void {
        // Implement resource request handling
        this.emit('resourceRequest', message);
    }

    private handleDataShare(message: Message): void {
        // Implement data sharing logic
        this.emit('dataShare', message);
    }

    private handlePatternUpdate(message: Message): void {
        // Implement pattern update propagation
        this.emit('patternUpdate', message);
    }

    private handleConsensusRequest(message: Message): void {
        // Implement consensus request handling
        this.emit('consensusRequest', message);
    }

    private handleNodeDiscovery(message: Message): void {
        // Implement node discovery logic
        this.emit('nodeDiscovery', message);
    }

    private generateNodeId(): string {
        return Math.random().toString(36).substring(2, 15);
    }

    public getNetworkStats(): any {
        return {
            connectedNodes: this.connections.size,
            maxConnections: this.config.maxConnections,
            activeConnections: Array.from(this.connections.keys())
        };
    }

    public disconnect(): void {
        // Clean up connections
        this.connections.forEach((connection, nodeId) => {
            connection.close();
            this.handleDisconnection(nodeId);
        });

        // Close server
        this.server.close(() => {
            this.emit('serverClosed');
        });
    }
}