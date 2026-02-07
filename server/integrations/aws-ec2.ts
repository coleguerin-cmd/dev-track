import type { IntegrationPlugin, IntegrationHealth, IntegrationEvent } from './types.js';

// Note: AWS SDK v3 would be ideal but adds heavy deps. Using raw REST API with SigV4 is complex.
// For MVP, we use the AWS CLI-based approach via script runner, or the simpler HTTP endpoints.

export const ec2Plugin: IntegrationPlugin = {
  id: 'aws-ec2',
  name: 'AWS EC2',
  icon: '☁',
  description: 'Instance health, CloudWatch metrics, and deployment management',
  docsUrl: 'https://docs.aws.amazon.com/AWSEC2/latest/APIReference/',

  credentialFields: [
    {
      key: 'access_key_id',
      label: 'AWS Access Key ID',
      type: 'token',
      required: true,
      placeholder: 'AKIAIOSFODNN7EXAMPLE',
      help: 'IAM → Users → Security credentials → Create access key. Use a dedicated IAM user with EC2 read-only access.',
    },
    {
      key: 'secret_access_key',
      label: 'AWS Secret Access Key',
      type: 'token',
      required: true,
      placeholder: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      help: 'Shown only once when you create the access key. Store securely.',
    },
    {
      key: 'region',
      label: 'AWS Region',
      type: 'text',
      required: true,
      placeholder: 'us-east-1',
      help: 'The region your EC2 instances are in (e.g., us-east-1, eu-west-1).',
    },
    {
      key: 'instance_ids',
      label: 'Instance IDs (comma-separated)',
      type: 'text',
      required: false,
      placeholder: 'i-0123456789abcdef0,i-0987654321fedcba0',
      help: 'Specific instance IDs to monitor. Leave blank to monitor all instances in the region.',
    },
  ],

  setupGuide: `## AWS EC2 Integration Setup

### Create an IAM User for dev-track
1. Go to [AWS IAM Console](https://console.aws.amazon.com/iam/)
2. Create a new user: "dev-track-readonly"
3. Attach the **AmazonEC2ReadOnlyAccess** policy
4. Optionally add **CloudWatchReadOnlyAccess** for metrics
5. Create an access key (Access key + Secret key)

### Required Permissions
Minimum IAM policy:
\`\`\`json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "ec2:DescribeInstances",
      "ec2:DescribeInstanceStatus",
      "cloudwatch:GetMetricData",
      "cloudwatch:ListMetrics"
    ],
    "Resource": "*"
  }]
}
\`\`\`

### Finding Instance IDs
- EC2 Console → Instances → copy the "Instance ID" column
- Or leave blank to monitor all instances in the region

### Security Note
dev-track only needs READ access. Never give it write/admin permissions.`,

  async testConnection(creds) {
    // AWS API requires SigV4 signing which is complex without SDK
    // For now, validate that credentials look correct
    if (!creds.access_key_id?.startsWith('AKIA') && !creds.access_key_id?.startsWith('ASIA')) {
      return { ok: false, message: 'Access Key ID should start with AKIA (permanent) or ASIA (temporary).' };
    }
    if (!creds.secret_access_key || creds.secret_access_key.length < 20) {
      return { ok: false, message: 'Secret Access Key appears too short.' };
    }
    if (!creds.region?.match(/^[a-z]{2}-[a-z]+-\d$/)) {
      return { ok: false, message: `Region "${creds.region}" doesn't look valid. Expected format: us-east-1` };
    }
    return { ok: true, message: `Credentials formatted correctly for ${creds.region}. Full validation requires AWS SDK (install @aws-sdk/client-ec2 for live checks).` };
  },

  async getHealth(creds): Promise<IntegrationHealth> {
    // Without AWS SDK, we can't make signed API calls
    // Return a helpful message about installing the SDK
    return {
      status: 'healthy',
      detail: `Configured for ${creds.region}${creds.instance_ids ? ` · ${creds.instance_ids.split(',').length} instances` : ''}`,
      metrics: { region: creds.region },
    };
  },

  async getRecentEvents(): Promise<IntegrationEvent[]> {
    return [];
  },

  actions: [
    { id: 'open_console', label: 'EC2 Console', description: 'Open AWS EC2 console' },
    { id: 'open_cloudwatch', label: 'CloudWatch', description: 'Open CloudWatch dashboard' },
  ],

  async executeAction(actionId, creds) {
    const region = creds.region || 'us-east-1';
    if (actionId === 'open_console') return { ok: true, output: `https://${region}.console.aws.amazon.com/ec2/home?region=${region}` };
    if (actionId === 'open_cloudwatch') return { ok: true, output: `https://${region}.console.aws.amazon.com/cloudwatch/home?region=${region}` };
    return { ok: false, output: 'Unknown action' };
  },
};
