export {
  CrosdatClinicalEmbedElement,
  mountClinicalEmbed,
  registerClinicalEmbedElement,
  type MountClinicalEmbedOptions,
  type MountedClinicalEmbed,
} from './host.js';
export {
  CROSDAT_EMBED_CHANNEL,
  FrameToHostMessageKind,
  HostToFrameMessageKind,
  consumeBootstrapFragment,
  encodeBootstrapFragment,
  type EmbedBootstrapPayload,
  type FrameToHostMessage,
  type HostToFrameMessage,
} from './protocol.js';
