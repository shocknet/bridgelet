import { nip44 } from 'nostr-tools';
import { hexToBytes } from '@noble/hashes/utils';

export const encryptData = (content: string, privateKey: string, publicKey: string) => {
  const privBytes = hexToBytes(privateKey);
  const conversationKey = nip44.getConversationKey(privBytes, publicKey);
  return nip44.encrypt(content, conversationKey);
};

export const decryptData = (payload: string, privateKey: string, publicKey: string) => {
  const privBytes = hexToBytes(privateKey);
  const conversationKey = nip44.getConversationKey(privBytes, publicKey);
  return nip44.decrypt(payload, conversationKey);
};