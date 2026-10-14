import { LeadError, type LeadChannel } from "./google-leads";

// Reserved recovery keys bind the operation to the authenticated opaque user ID.
// The channel is needed to retry the original operation without storing a payload.
const prefix = "gr1_";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const channelCodes = { line: "l", phone: "p", web: "w", other: "o" } as const;
const codeChannels = { l: "line", p: "phone", w: "web", o: "other" } as const;
export type LeadOperationIdentity = { userId: string; channel: LeadChannel };

function compactUUID(value: string) {
  if (!uuid.test(value)) throw new LeadError("登録操作を確認してください。");
  return value.toLowerCase().replaceAll("-", "");
}

export function createLeadOperationKey(userId: string, channel: LeadChannel, nonceUUID: string): string {
  if (!Object.hasOwn(channelCodes, channel)) throw new LeadError("登録操作を確認してください。");
  return `${prefix}${compactUUID(userId)}_${channelCodes[channel]}_${compactUUID(nonceUUID)}`;
}

export function parseLeadOperationKey(value: unknown): LeadOperationIdentity | null {
  if (typeof value !== "string") return null;
  const match = /^gr1_([0-9a-f]{32})_([lpwo])_([0-9a-f]{32})$/.exec(value);
  if (!match) return null;
  const owner = match[1];
  return {
    userId: `${owner.slice(0, 8)}-${owner.slice(8, 12)}-${owner.slice(12, 16)}-${owner.slice(16, 20)}-${owner.slice(20)}`,
    channel: codeChannels[match[2] as keyof typeof codeChannels],
  };
}

export function validateLeadOperationKey(key: string, userId: string, channel?: LeadChannel): LeadOperationIdentity {
  const identity = parseLeadOperationKey(key);
  if (!identity) throw new LeadError("登録操作を確認してください。");
  // Neither a stored browser user ID nor the key itself grants access.
  if (identity.userId !== userId.toLowerCase()) throw new LeadError("この登録操作は確認できません。", 403);
  if (channel !== undefined && identity.channel !== channel) throw new LeadError("登録操作の経路を確認してください。");
  return identity;
}

export function validateLeadCreateKey(key: string, userId: string, channel: LeadChannel): void {
  if (key.startsWith(prefix)) validateLeadOperationKey(key, userId, channel);
}
