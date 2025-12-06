const User = require('./User');
const Inquiry = require('./Inquiry');
const Dealer = require('./Dealer');
// 暂时注释掉其他模型，因为我们只实现了 User、Inquiry 和 Dealer
// const Trade = require('./Trade');
// const MarketData = require('./MarketData');

module.exports = {
  User,
  Inquiry,
  Dealer
  // Trade,
  // MarketData
};