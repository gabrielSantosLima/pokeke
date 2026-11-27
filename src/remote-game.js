/** Minimal game facade for LAN clients: state arrives over the socket. */
export class RemoteGame {
  constructor({ viewerId, send }) {
    this.viewerId = viewerId;
    this.send = send;
    this.smallBlind = 10;
    this.bigBlind = 20;
    this.state = null;
  }

  submitAction(playerIdOrAction, maybeAction) {
    const action = maybeAction || playerIdOrAction;
    if (!action || !action.type) return false;
    this.send({ t: 'action', action });
    return true;
  }

  submitReaction(text) {
    if (!text) return false;
    this.send({ t: 'reaction', text: String(text).slice(0, 40) });
    return true;
  }

  submitPower(payload) {
    if (!payload || !payload.powerId) return false;
    this.send({ t: 'power', power: payload });
    return true;
  }

  submitPowerDraft(picks) {
    if (!Array.isArray(picks) || picks.length !== 2) return false;
    this.send({ t: 'power-draft', picks });
    return true;
  }

  submitMarket(itemId) {
    if (!itemId) return false;
    this.send({ t: 'market', itemId });
    return true;
  }
}
