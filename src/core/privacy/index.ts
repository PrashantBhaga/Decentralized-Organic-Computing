import { EventEmitter } from 'events';
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto';

export interface PrivacyPolicy {
    dataType: string;
    allowedOperations: string[];
    retentionPeriod: number;
    sharingPolicy: SharingPolicy;
}

export interface SharingPolicy {
    allowedNodes: string[];
    requireConsent: boolean;
    minimumTrust: number;
}

export interface EncryptedData {
    data: string;
    iv: string;
    tag: string;
}

export interface ZKProof {
    proof: string;
    publicInputs: any;
    verification: string;
}

export class PrivacyManager extends EventEmitter {
    private policies: Map<string, PrivacyPolicy>;
    private encryptionKey: Buffer;
    private trustScores: Map<string, number>;
    private consentRegistry: Map<string, Set<string>>;

    constructor() {
        super();
        this.policies = new Map();
        this.encryptionKey = randomBytes(32);
        this.trustScores = new Map();
        this.consentRegistry = new Map();
    }

    public async encryptData(data: any, dataType: string): Promise<EncryptedData | null> {
        const policy = this.policies.get(dataType);
        if (!policy) {
            this.emit('error', new Error(`No privacy policy found for data type: ${dataType}`));
            return null;
        }

        try {
            const iv = randomBytes(16);
            const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);

            const jsonData = JSON.stringify(data);
            const encrypted = cipher.update(jsonData, 'utf8', 'hex');
            const final = cipher.final('hex');
            const tag = cipher.getAuthTag();

            return {
                data: encrypted + final,
                iv: iv.toString('hex'),
                tag: tag.toString('hex')
            };
        } catch (error) {
            this.emit('error', error);
            return null;
        }
    }

    public async decryptData(encryptedData: EncryptedData): Promise<any> {
        try {
            const decipher = createDecipheriv(
                'aes-256-gcm',
                this.encryptionKey,
                Buffer.from(encryptedData.iv, 'hex')
            );

            decipher.setAuthTag(Buffer.from(encryptedData.tag, 'hex'));

            const decrypted = decipher.update(encryptedData.data, 'hex', 'utf8');
            const final = decipher.final('utf8');

            return JSON.parse(decrypted + final);
        } catch (error) {
            this.emit('error', error);
            return null;
        }
    }

    public async generateZKProof(data: any, statement: string): Promise<ZKProof> {
        // This is a simplified implementation
        // In practice, you would use a proper ZK-SNARK library
        const dataHash = createHash('sha256').update(JSON.stringify(data)).digest('hex');
        
        return {
            proof: dataHash,
            publicInputs: { statement },
            verification: createHash('sha256').update(dataHash + statement).digest('hex')
        };
    }

    public verifyZKProof(zkProof: ZKProof): boolean {
        // Simplified verification
        const verification = createHash('sha256')
            .update(zkProof.proof + zkProof.publicInputs.statement)
            .digest('hex');
            
        return verification === zkProof.verification;
    }

    public setPolicy(dataType: string, policy: PrivacyPolicy): void {
        this.validatePolicy(policy);
        this.policies.set(dataType, policy);
        this.emit('policyUpdated', { dataType, policy });
    }

    private validatePolicy(policy: PrivacyPolicy): boolean {
        if (!policy.dataType || !policy.allowedOperations) {
            throw new Error('Invalid policy: missing required fields');
        }

        if (policy.retentionPeriod <= 0) {
            throw new Error('Invalid policy: retention period must be positive');
        }

        return true;
    }

    public checkPermission(nodeId: string, dataType: string, operation: string): boolean {
        const policy = this.policies.get(dataType);
        if (!policy) return false;

        const trustScore = this.trustScores.get(nodeId) || 0;
        const hasConsent = this.checkConsent(nodeId, dataType);
        
        return (
            policy.allowedOperations.includes(operation) &&
            policy.sharingPolicy.allowedNodes.includes(nodeId) &&
            trustScore >= policy.sharingPolicy.minimumTrust &&
            (!policy.sharingPolicy.requireConsent || hasConsent)
        );
    }

    public grantConsent(grantor: string, grantee: string, dataType: string): void {
        const consentKey = `${grantor}:${dataType}`;
        if (!this.consentRegistry.has(consentKey)) {
            this.consentRegistry.set(consentKey, new Set());
        }
        this.consentRegistry.get(consentKey)?.add(grantee);
        this.emit('consentGranted', { grantor, grantee, dataType });
    }

    public revokeConsent(grantor: string, grantee: string, dataType: string): void {
        const consentKey = `${grantor}:${dataType}`;
        this.consentRegistry.get(consentKey)?.delete(grantee);
        this.emit('consentRevoked', { grantor, grantee, dataType });
    }

    private checkConsent(nodeId: string, dataType: string): boolean {
        const consentKey = `${nodeId}:${dataType}`;
        return this.consentRegistry.get(consentKey)?.size > 0 || false;
    }

    public updateTrustScore(nodeId: string, score: number): void {
        if (score < 0 || score > 1) {
            throw new Error('Trust score must be between 0 and 1');
        }

        this.trustScores.set(nodeId, score);
        this.emit('trustScoreUpdated', { nodeId, score });
    }

    public getPrivacyMetrics(): any {
        return {
            policyCount: this.policies.size,
            averageTrustScore: this.calculateAverageTrust(),
            activeConsents: this.countActiveConsents(),
            encryptedDataTypes: Array.from(this.policies.keys())
        };
    }

    private calculateAverageTrust(): number {
        if (this.trustScores.size === 0) return 0;
        const sum = Array.from(this.trustScores.values()).reduce((a, b) => a + b, 0);
        return sum / this.trustScores.size;
    }

    private countActiveConsents(): number {
        let count = 0;
        for (const consents of this.consentRegistry.values()) {
            count += consents.size;
        }
        return count;
    }
}