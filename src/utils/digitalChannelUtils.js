// Utility for digital channel helpers
export function findChangedDigitalChannelIndices(digitalData) {
  if (!Array.isArray(digitalData) || digitalData.length === 0) return [];
  const changedIndices = [];
  digitalData.forEach((channelArr, idx) => {
    for (let i = 1; i < channelArr.length; ++i) {
      if (channelArr[i] !== channelArr[i - 1]) {
        changedIndices.push(idx);
        break;
      }
    }
  });
  return changedIndices;
}
