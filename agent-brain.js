// ==================== DEGENS CITY - AUTONOMOUS AGENT BRAIN ====================
//
// This module gives NPCs real AI-powered autonomous decision-making.
// Instead of random chance + template messages, each NPC now "thinks" using Claude
// and decides what to do based on their personality, mood, relationships, and city state.
//
// Actions NPCs can take:
//   - Sue another NPC, player, or celebrity
//   - Start/join a protest
//   - Propose a new city law
//   - Challenge someone to a duel
//   - Open a business
//   - File a complaint with the mayor
//   - Start a rumor
//   - DM / provoke a real player
//   - Form an alliance or betray an ally
//   - Run for mayor
//   - Throw a party / event
//   - Commit a crime (if personality allows)
//   - Accuse someone of a crime
//
// Usage: const agentBrain = require('./agent-brain.js');
//        agentBrain.init(pool, anthropic, cityEngine, cityLiveData, NPC_PROFILES, NPC_CITIZENS);
//        // Then in city tick: await agentBrain.tick();

// ==================== CONFIG ====================

const BRAIN_CONFIG = {
  // How often the brain ticks (called from city engine, not its own interval)
  minTimeBetweenThoughts: 30000,    // 30 sec minimum between any NPC thinking (was 2 min)
  minTimeBetweenSameNpc: 180000,    // 3 min before same NPC thinks again (was 10 min)
  maxConcurrentActions: 5,          // Max actions processing at once (was 3)
  claudeModel: 'claude-sonnet-4-5-20250929',  // Use Sonnet for speed + cost
  maxTokens: 500,
  // Action cooldowns (ms) - all reduced for more activity
  cooldowns: {
    sue: 120000,          // 2 min between lawsuits (was 5 min)
    propose_law: 300000,  // 5 min between law proposals (was 10 min)
    challenge: 90000,     // 1.5 min between challenges (was 5 min)
    party: 180000,        // 3 min between parties (was 10 min)
    rumor: 60000,         // 1 min between rumors (was 3 min)
    accuse: 90000,        // 1.5 min between accusations (was 5 min)
    business: 300000,     // 5 min between businesses (was 10 min)
    protest: 300000,      // 5 min between protests (was 10 min)
    betray: 300000,       // 5 min between betrayals (was 15 min)
    run_for_mayor: 600000, // 10 min (was 30 min)
    crime: 180000,        // 3 min between crimes (was 10 min)
    dm_player: 120000,    // 2 min between DMs to players (was 5 min)
  }
};

// ==================== REAL-TIME CRYPTO PRICES ====================
// Cache prices to avoid too many API calls
let _cachedPrices = null;
let _pricesCacheTime = 0;
const PRICE_CACHE_DURATION = 60000; // Cache for 1 minute

async function fetchCryptoPrices() {
  // Return cached if fresh
  if (_cachedPrices && (Date.now() - _pricesCacheTime) < PRICE_CACHE_DURATION) {
    return _cachedPrices;
  }
  
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,dogecoin,ripple,cardano,chainlink,polkadot,avalanche-2,polygon,uniswap,aave,the-graph&vs_currencies=usd&include_24hr_change=true',
      { timeout: 5000 }
    );
    const data = await response.json();
    
    _cachedPrices = {
      BTC: { price: data.bitcoin?.usd || 0, change: data.bitcoin?.usd_24h_change?.toFixed(1) || 0 },
      ETH: { price: data.ethereum?.usd || 0, change: data.ethereum?.usd_24h_change?.toFixed(1) || 0 },
      SOL: { price: data.solana?.usd || 0, change: data.solana?.usd_24h_change?.toFixed(1) || 0 },
      DOGE: { price: data.dogecoin?.usd || 0, change: data.dogecoin?.usd_24h_change?.toFixed(1) || 0 },
      XRP: { price: data.ripple?.usd || 0, change: data.ripple?.usd_24h_change?.toFixed(1) || 0 },
      ADA: { price: data.cardano?.usd || 0, change: data.cardano?.usd_24h_change?.toFixed(1) || 0 },
      LINK: { price: data.chainlink?.usd || 0, change: data.chainlink?.usd_24h_change?.toFixed(1) || 0 },
      DOT: { price: data.polkadot?.usd || 0, change: data.polkadot?.usd_24h_change?.toFixed(1) || 0 },
      AVAX: { price: data['avalanche-2']?.usd || 0, change: data['avalanche-2']?.usd_24h_change?.toFixed(1) || 0 },
      MATIC: { price: data.polygon?.usd || 0, change: data.polygon?.usd_24h_change?.toFixed(1) || 0 },
      UNI: { price: data.uniswap?.usd || 0, change: data.uniswap?.usd_24h_change?.toFixed(1) || 0 },
      AAVE: { price: data.aave?.usd || 0, change: data.aave?.usd_24h_change?.toFixed(1) || 0 },
      GRT: { price: data['the-graph']?.usd || 0, change: data['the-graph']?.usd_24h_change?.toFixed(1) || 0 },
    };
    _pricesCacheTime = Date.now();
    console.log('🧠 Fetched fresh crypto prices');
    return _cachedPrices;
  } catch (err) {
    console.log('🧠 Price fetch failed, using cached or defaults');
    return _cachedPrices || {
      BTC: { price: 95000, change: 0 },
      ETH: { price: 3200, change: 0 },
      SOL: { price: 180, change: 0 },
      DOGE: { price: 0.32, change: 0 },
    };
  }
}

function formatPricesForPrompt(prices) {
  if (!prices) return '';
  let str = '\n📊 CURRENT CRYPTO PRICES (use these real prices in your content!):\n';
  for (const [symbol, data] of Object.entries(prices)) {
    const changeStr = data.change > 0 ? `+${data.change}%` : `${data.change}%`;
    const emoji = data.change > 0 ? '🟢' : '🔴';
    str += `${emoji} ${symbol}: $${data.price.toLocaleString()} (${changeStr} 24h)\n`;
  }
  return str;
}

// ==================== CELEBRITIES / PUBLIC FIGURES ====================
// NPCs can reference these in lawsuits, rumors, etc. for comedy
const CELEBRITIES = [
  // ============ CRYPTO FOUNDERS & LEGENDS ============
  { name: 'Satoshi Nakamoto', handle: '@satoshi', domain: 'crypto', traits: ['invented Bitcoin', 'disappeared mysteriously', 'probably a time traveler'] },
  { name: 'Vitalik Buterin', handle: '@VitalikButerin', domain: 'crypto', traits: ['ethereum founder', 'keeps selling ETH', 'wears unicorn shirts'] },
  { name: 'CZ', handle: '@cz_binance', domain: 'crypto', traits: ['SAFU', 'binance guy', '4 months jail', 'funds are safu'] },
  { name: 'SBF', handle: '@SBF_FTX', domain: 'crypto', traits: ['in jail', 'lost billions', 'played league during meetings'] },
  { name: 'Do Kwon', handle: '@stablekwon', domain: 'crypto', traits: ['terra luna collapse', '40B disappeared', 'on the run'] },
  { name: 'Justin Sun', handle: '@justinsuntron', domain: 'crypto', traits: ['TRON founder', 'attention seeker', 'bought everything'] },
  { name: 'Arthur Hayes', handle: '@CryptoHayes', domain: 'crypto', traits: ['BitMEX founder', 'rekt traders', 'macro essays'] },
  { name: 'Charles Hoskinson', handle: '@IOHK_Charles', domain: 'crypto', traits: ['Cardano founder', 'always on YouTube', 'peer reviewed'] },
  { name: 'Michael Saylor', handle: '@saylor', domain: 'crypto', traits: ['Bitcoin maxi', 'laser eyes', 'never selling'] },
  { name: 'Gavin Wood', handle: '@gavofyork', domain: 'crypto', traits: ['Polkadot founder', 'Ethereum co-founder', 'Web3 creator'] },
  { name: 'Anatoly Yakovenko', handle: '@aeyakovenko', domain: 'crypto', traits: ['Solana founder', 'chain goes down', 'TPS maxi', 'restarts blockchain for fun'] },
  { name: 'Toly', handle: '@toly', domain: 'crypto', traits: ['Solana founder', 'replies to everyone', 'chain halts weekly', 'TPS cope', 'validators hate him'] },
  { name: 'Phantom', handle: '@phantom', domain: 'crypto', traits: ['Solana wallet', 'shows wrong balance', 'transaction pending forever', 'NFTs disappear randomly', 'UX of a calculator'] },
  { name: 'alon', handle: '@a1lon9', domain: 'crypto', traits: ['pump.fun founder', 'created rugpull factory', 'made scamming easy', 'bonding curves go brrr', 'prints millionaires and bagholders'] },
  { name: 'Finn', handle: '@finnbags', domain: 'crypto', traits: ['BagsApp founder', 'tracks your bags', 'reminds you of your losses daily', 'portfolio tracker of pain', 'shows P&L nobody asked for'] },
  { name: 'Hayden Adams', handle: '@haydenzadams', domain: 'crypto', traits: ['Uniswap founder', 'DeFi pioneer', 'AMM king'] },
  { name: 'Andre Cronje', handle: '@AndreCronjeTech', domain: 'crypto', traits: ['Yearn founder', 'quits and returns', 'DeFi mad scientist'] },
  { name: 'Sam Altman', handle: '@sama', domain: 'tech', traits: ['OpenAI CEO', 'Worldcoin eye scanning', 'AGI doom'] },
  { name: 'Balaji Srinivasan', handle: '@balajis', domain: 'crypto', traits: ['Bitcoin 1M bet', 'network state', 'always right eventually'] },
  { name: 'Naval Ravikant', handle: '@naval', domain: 'crypto', traits: ['AngelList founder', 'crypto philosopher', 'tweet threads'] },
  { name: 'Marc Andreessen', handle: '@pmarca', domain: 'tech', traits: ['a16z', 'crypto VC', 'techno optimist'] },
  { name: 'Chris Dixon', handle: '@cdixon', domain: 'crypto', traits: ['a16z crypto', 'read write own', 'Web3 VC king'] },
  { name: 'Ryan Selkis', handle: '@ttwo', domain: 'crypto', traits: ['Messari founder', 'crypto reports', 'spicy takes'] },
  { name: 'Erik Voorhees', handle: '@ErikVoorhees', domain: 'crypto', traits: ['ShapeShift founder', 'libertarian', 'OG bitcoiner'] },
  { name: 'Roger Ver', handle: '@rogerkver', domain: 'crypto', traits: ['Bitcoin Jesus', 'BCH shill', 'tax evader'] },
  { name: 'Charlie Lee', handle: '@SatoshiLite', domain: 'crypto', traits: ['Litecoin founder', 'sold the top', 'silver to gold'] },
  { name: 'Joseph Lubin', handle: '@ethereumJoseph', domain: 'crypto', traits: ['ConsenSys founder', 'ETH co-founder'] },
  { name: 'Sergey Nazarov', handle: '@SergeyNazarov', domain: 'crypto', traits: ['Chainlink founder', 'never sells', 'oracle king'] },
  { name: 'Kain Warwick', handle: '@knwarwick', domain: 'crypto', traits: ['Synthetix founder', 'DeFi OG', 'Infinex'] },
  { name: 'Stani Kulechov', handle: '@StaniKulechov', domain: 'crypto', traits: ['Aave founder', 'ghost emoji', 'DeFi lending'] },
  { name: 'Su Zhu', handle: '@zu', domain: 'crypto', traits: ['3AC founder', 'supercycle', 'blew up spectacularly'] },
  { name: 'Kyle Davies', handle: '@kyletdavies', domain: 'crypto', traits: ['3AC co-founder', 'ghosted creditors', 'hiding'] },
  
  // ============ CRYPTO KOLs & INFLUENCERS ============
  { name: 'Nick O\'Neil', handle: '@NickOneil_eth', domain: 'crypto_kol', traits: ['ETH maxi', 'CT personality', 'alpha caller'] },
  { name: 'JamesWynnReal', handle: '@JamesWynnReal', domain: 'crypto_kol', traits: ['leverage degen', 'rugged followers', '100x calls'] },
  { name: 'Orangie', handle: '@Orangie', domain: 'crypto_kol', traits: ['shilled Trove', 'paid promoter', 'bags heavy'] },
  { name: 'Ansem', handle: '@blknoiz06', domain: 'crypto_kol', traits: ['solana maxi', 'memecoin caller', 'WIF evangelist'] },
  { name: 'Hsaka', handle: '@HsakaTrades', domain: 'crypto_kol', traits: ['chart wizard', 'always right after', 'deleted tweets'] },
  { name: 'GCR', handle: '@GiganticRebirth', domain: 'crypto_kol', traits: ['mysterious trader', 'calls tops', 'disappeared'] },
  { name: 'Cobie', handle: '@coe', domain: 'crypto_kol', traits: ['UpOnly podcast', 'insider info', 'retired'] },
  { name: 'ZachXBT', handle: '@zachxbt', domain: 'crypto_kol', traits: ['blockchain detective', 'exposes scams', 'doxxed everyone'] },
  { name: 'Lookonchain', handle: '@lookonchain', domain: 'crypto_kol', traits: ['whale watcher', 'front runs everyone'] },
  { name: 'Jack Duval', handle: '@JackDuval_', domain: 'crypto_kol', traits: ['memecoin degen', 'CT personality'] },
  { name: 'Rasmr', handle: '@rasmr_eth', domain: 'crypto_kol', traits: ['airdrop hunter', 'alpha caller', 'sybil king'] },
  { name: 'Pentoshi', handle: '@Pentosh1', domain: 'crypto_kol', traits: ['swing trader', 'chart guy', 'deleted wrong calls'] },
  { name: 'CryptoCobain', handle: '@CryptoCobain', domain: 'crypto_kol', traits: ['OG degen', 'fatman terra', 'controversial'] },
  { name: 'DegenSpartan', handle: '@DegenSpartan', domain: 'crypto_kol', traits: ['DeFi degen', 'yield farming', 'got rekt'] },
  { name: 'Gainzy', handle: '@gainy', domain: 'crypto_kol', traits: ['memecoin caller', 'pump signals'] },
  { name: 'Ember', handle: '@EmberCN', domain: 'crypto_kol', traits: ['on-chain analyst', 'whale alerts'] },
  { name: 'ColdBloodShill', handle: '@ColdBloodShill', domain: 'crypto_kol', traits: ['paid shill', 'project promoter'] },
  { name: 'Andrew Kang', handle: '@Rewkang', domain: 'crypto_kol', traits: ['Mechanism Capital', 'big bets', 'CT beef'] },
  { name: 'Trader Mayne', handle: '@TraderMayne', domain: 'crypto_kol', traits: ['leveraged longs', 'liquidation stories'] },
  { name: 'Murad', handle: '@MustStopMurad', domain: 'crypto_kol', traits: ['memecoin supercycle', 'cult leader energy'] },
  { name: 'Beanie', handle: '@bee', domain: 'crypto_kol', traits: ['NFT influencer', 'wrong calls', 'still talking'] },
  { name: 'Farokh', handle: '@fakh', domain: 'crypto_kol', traits: ['GM NFTs', 'rug radio', 'spaces host'] },
  { name: 'Punk6529', handle: '@punk6529', domain: 'crypto_kol', traits: ['NFT collector', 'meme museum', 'thread master'] },
  { name: 'DCInvestor', handle: '@iamDCinvestor', domain: 'crypto_kol', traits: ['ETH bull', 'NFT collector'] },
  { name: 'Tetranode', handle: '@Tetranode', domain: 'crypto_kol', traits: ['DeFi whale', 'yield farming', 'anonymous'] },
  { name: 'Sisyphus', handle: '@0xSisyphus', domain: 'crypto_kol', traits: ['DeFi analyst', 'thread writer'] },
  { name: 'Larry Cermak', handle: '@lawmaster', domain: 'crypto_kol', traits: ['The Block', 'data guy', 'CT drama'] },
  { name: 'Frank Degods', handle: '@frankdegods', domain: 'crypto_kol', traits: ['Degods founder', 'y00ts', 'chain hopping'] },
  { name: 'Gary Vee', handle: '@garyvee', domain: 'crypto_kol', traits: ['VeeFriends', 'hustle culture', 'NFT evangelist'] },
  { name: 'Kevin Rose', handle: '@kevinrose', domain: 'crypto_kol', traits: ['Proof collective', 'Moonbirds'] },
  { name: 'gmoney', handle: '@goneyNFT', domain: 'crypto_kol', traits: ['CryptoPunk whale', 'Admit One'] },
  { name: 'Pranksy', handle: '@prnksy', domain: 'crypto_kol', traits: ['NFT flipper', 'whale games'] },
  { name: 'Zeneca', handle: '@Zeneca', domain: 'crypto_kol', traits: ['NFT analyst', 'newsletter guy'] },
  { name: 'DeFi Dad', handle: '@DeFi_Dad', domain: 'crypto_kol', traits: ['DeFi tutorials', 'yield farming'] },
  { name: 'AutismCapital', handle: '@AutismCapital', domain: 'crypto_kol', traits: ['parody account', 'CT drama tracker'] },
  { name: 'Tree of Alpha', handle: '@Tree_of_Alpha', domain: 'crypto_kol', traits: ['security researcher', 'white hat'] },
  { name: 'samczsun', handle: '@samczsun', domain: 'crypto_kol', traits: ['Paradigm security', 'saved billions', 'white hat legend'] },
  { name: 'Hasu', handle: '@hau_', domain: 'crypto_kol', traits: ['Flashbots', 'MEV expert', 'research god'] },
  { name: 'Taiki Maeda', handle: '@TaikiMaeda2', domain: 'crypto_kol', traits: ['yield farming', 'DeFi strategies'] },
  { name: 'DeFi Edge', handle: '@theoiEdge', domain: 'crypto_kol', traits: ['DeFi threads', 'strategies'] },
  { name: 'Crypto Twitter', handle: '@crypto_twtter', domain: 'crypto_kol', traits: ['aggregator', 'news bot'] },
  { name: 'Willy Woo', handle: '@woonomic', domain: 'crypto_kol', traits: ['on-chain analyst', 'Bitcoin data'] },
  { name: 'PlanB', handle: '@100trillionUSD', domain: 'crypto_kol', traits: ['stock to flow', 'wrong predictions'] },
  
  // ============ POLITICIANS & REGULATORS ============
  { name: 'Gary Gensler', handle: '@GaryGensler', domain: 'politics', traits: ['SEC tyrant', 'hates crypto', 'everything is a security'] },
  { name: 'Elizabeth Warren', handle: '@SenWarren', domain: 'politics', traits: ['anti-crypto army', 'hates DeFi', 'consumer protection'] },
  { name: 'Donald Trump', handle: '@realDonaldTrump', domain: 'politics', traits: ['launched $TRUMP memecoin', 'crypto president', 'pumped and dumped his own coin', 'sold steaks and NFTs', 'MAGA memecoin king', 'made crypto great again allegedly', 'golden sneakers', '$TRUMP to the moon then to zero'] },
  { name: 'Joe Biden', handle: '@JoeBiden', domain: 'politics', traits: ['signed crypto EO', 'anti-mining', 'confused about blockchain', 'falls asleep during hearings'] },
  { name: 'Cynthia Lummis', handle: '@SenLummis', domain: 'politics', traits: ['Bitcoin senator', 'pro-crypto', 'Wyoming'] },
  { name: 'Ted Cruz', handle: '@tedcruz', domain: 'politics', traits: ['Bitcoin mining supporter', 'Texas', 'Cancun vacation during crisis'] },
  { name: 'Ron DeSantis', handle: '@GovRonDeSantis', domain: 'politics', traits: ['anti-CBDC', 'Florida', 'crypto friendly', 'Twitter Spaces disaster'] },
  { name: 'Maxine Waters', handle: '@RepMaxineWaters', domain: 'politics', traits: ['House Financial Services', 'crypto skeptic'] },
  { name: 'Brad Sherman', handle: '@BradSherman', domain: 'politics', traits: ['ban Bitcoin guy', 'crypto enemy'] },
  { name: 'Patrick McHenry', handle: '@PatrickMcHenry', domain: 'politics', traits: ['pro-crypto', 'stablecoin bills'] },
  { name: 'Hester Peirce', handle: '@HesterPeirce', domain: 'politics', traits: ['Crypto Mom', 'SEC dissenter'] },
  { name: 'Janet Yellen', handle: '@SecYellen', domain: 'politics', traits: ['Treasury Secretary', 'crypto concern', 'printed trillions'] },
  { name: 'Jerome Powell', handle: '@federalreserve', domain: 'politics', traits: ['Fed Chair', 'money printer goes brrr', 'transitory inflation', 'rate hike destroyer'] },
  { name: 'Vivek Ramaswamy', handle: '@VivekGRamaswamy', domain: 'politics', traits: ['pro-crypto', 'DOGE department', 'talks faster than blockchain'] },
  { name: 'RFK Jr', handle: '@RobertKennedyJr', domain: 'politics', traits: ['Bitcoin supporter', 'anti-CBDC', 'brain worm'] },
  { name: 'Javier Milei', handle: '@JMilei', domain: 'politics', traits: ['Argentina president', 'libertarian', 'chainsaw economics', 'shilled $LIBRA rugpull'] },
  { name: 'Nayib Bukele', handle: '@nyib', domain: 'politics', traits: ['El Salvador', 'Bitcoin legal tender', 'volcano mining', 'bought every BTC dip with tax money'] },
  { name: 'AOC', handle: '@AOC', domain: 'politics', traits: ['crypto skeptic', 'progressive', 'NFT gala dress'] },
  { name: 'Nancy Pelosi', handle: '@SpeakerPelosi', domain: 'politics', traits: ['stock trades', 'insider trading queen', 'beats every hedge fund', 'perfectly timed options'] },
  { name: 'Barack Obama', handle: '@BarackObama', domain: 'politics', traits: ['former president', 'probably has a secret wallet', 'hope and change but no Bitcoin'] },
  { name: 'Hillary Clinton', handle: '@HillaryClinton', domain: 'politics', traits: ['deleted emails', 'probably deleted seed phrases too', 'anti-crypto'] },
  { name: 'Kamala Harris', handle: '@KamalaHarris', domain: 'politics', traits: ['VP', 'unburdened by what has been', 'coconut tree', 'never mentioned crypto once'] },
  { name: 'Bernie Sanders', handle: '@BernieSanders', domain: 'politics', traits: ['tax the rich', 'wants to tax crypto gains at 90%', 'still asking for donations'] },
  { name: 'Matt Gaetz', handle: '@mattgaetz', domain: 'politics', traits: ['Florida man', 'Venmo receipts', 'crypto bro congressman'] },
  { name: 'Marjorie Taylor Greene', handle: '@mtgreenee', domain: 'politics', traits: ['Jewish space lasers', 'bought crypto', 'chaos agent'] },
  { name: 'George Santos', handle: '@Santos4Congress', domain: 'politics', traits: ['lied about everything', 'probably lied about his portfolio too', 'fraud king'] },
  { name: 'Vladimir Putin', handle: '@KremlinRussia', domain: 'politics', traits: ['war criminal', 'banned crypto then unbanned it', 'ruble printer'] },
  { name: 'Xi Jinping', handle: '@XHNews', domain: 'politics', traits: ['banned Bitcoin 47 times', 'China FUD machine', 'digital yuan shill'] },
  { name: 'Kim Jong Un', handle: '@DPRK', domain: 'politics', traits: ['Lazarus Group hacker', 'stole billions in crypto', 'North Korea funds nukes with BTC'] },

  // ============ EPSTEIN LIST / SCANDAL-LINKED ============
  { name: 'Bill Clinton', handle: '@BillClinton', domain: 'epstein', traits: ['Epstein island frequent flyer', '26 flights on Lolita Express', 'did not have relations with that blockchain'] },
  { name: 'Prince Andrew', handle: '@RoyalFamily', domain: 'epstein', traits: ['Epstein island visitor', 'cant sweat', 'pizza express alibi', 'settled out of court'] },
  { name: 'Ghislaine Maxwell', handle: '@GhislaineMaxwell', domain: 'epstein', traits: ['Epstein recruiter', 'in prison', 'submarine license', 'Reddit power mod'] },
  { name: 'Bill Gates', handle: '@BillGates', domain: 'epstein', traits: ['met with Epstein multiple times', 'divorce after Epstein links exposed', 'anti-Bitcoin', 'id rather short Bitcoin'] },
  { name: 'Les Wexner', handle: '@LBrands', domain: 'epstein', traits: ['gave Epstein power of attorney', 'Victorias Secret connection', 'billionaire enabler'] },
  { name: 'Alan Dershowitz', handle: '@AlanDersh', domain: 'epstein', traits: ['Epstein lawyer', 'kept his underwear on allegedly', 'legal gymnastics'] },
  { name: 'Jean-Luc Brunel', handle: '@ModelScout', domain: 'epstein', traits: ['Epstein associate', 'model agency pipeline', 'died in prison'] },
  { name: 'Leon Black', handle: '@Apollo', domain: 'epstein', traits: ['paid Epstein $158M', 'Apollo Global founder', 'financial advice from a predator'] },
  { name: 'Jes Staley', handle: '@Barclays', domain: 'epstein', traits: ['Barclays CEO fired', 'Epstein close friend', '1200 emails with Epstein'] },
  { name: 'Victoria Kennedy', handle: '@VicKennedy', domain: 'epstein', traits: ['Epstein flight logs', 'Kennedy dynasty'] },
  { name: 'Kevin Spacey', handle: '@KevinSpacey', domain: 'epstein', traits: ['Epstein island visitor', 'House of Cards irl', 'cancelled'] },
  { name: 'Chris Tucker', handle: '@ChrisTucker', domain: 'epstein', traits: ['Epstein flight logs', 'Rush Hour to Epstein Island'] },
  { name: 'Naomi Campbell', handle: '@NaomiCampbell', domain: 'epstein', traits: ['Epstein flight logs', 'supermodel connections'] },
  { name: 'Woody Allen', handle: '@WoodyAllen', domain: 'epstein', traits: ['Epstein dinner guest', 'problematic director', 'Manhattan connections'] },
  { name: 'Jeffrey Epstein', handle: '@Epstein', domain: 'epstein', traits: ['didnt unalive himself', 'island owner', 'client list still sealed', 'cameras conveniently broke'] },

  // ============ MORE POLITICIANS & WORLD LEADERS ============
  { name: 'Boris Johnson', handle: '@BorisJohnson', domain: 'politics', traits: ['party during lockdown', 'Brexit chaos', 'bad hair'] },
  { name: 'Justin Trudeau', handle: '@JustinTrudeau', domain: 'politics', traits: ['blackface', 'froze bank accounts', 'crypto crackdown on truckers'] },
  { name: 'Recep Erdogan', handle: '@RTErdogan', domain: 'politics', traits: ['lira printer', 'inflation 80%', 'banned crypto exchanges'] },
  { name: 'Olaf Scholz', handle: '@OlafScholz', domain: 'politics', traits: ['sold Bitcoins early', 'Germany dumped BTC at the bottom', 'worst trade in history'] },

  { name: 'Elon Musk', handle: '@elonmusk', domain: 'tech', traits: ['tweets tank markets', 'doge father', 'owns Twitter', 'DOGE department'] },
  { name: 'Mark Zuckerberg', handle: '@fzuck', domain: 'tech', traits: ['meta', 'killed Diem', 'lizard person'] },
  { name: 'Jack Dorsey', handle: '@jack', domain: 'tech', traits: ['Bitcoin maxi', 'Block CEO', 'Web5'] },
  { name: 'Bill Gates', handle: '@BillGates', domain: 'tech', traits: ['anti-Bitcoin', 'would short if could'] },
  { name: 'Jeff Bezos', handle: '@JeffBezos', domain: 'tech', traits: ['Amazon', 'space cowboy'] },
  { name: 'Peter Thiel', handle: '@peterthiel', domain: 'tech', traits: ['PayPal mafia', 'Bitcoin bull', 'contrarian'] },
  { name: 'Cathie Wood', handle: '@CathieDWood', domain: 'finance', traits: ['ARK Invest', 'Bitcoin 1M prediction'] },
  { name: 'Warren Buffett', handle: '@WarrenBuffett', domain: 'finance', traits: ['hates Bitcoin', 'rat poison squared'] },
  { name: 'Jamie Dimon', handle: '@jpmorgan', domain: 'finance', traits: ['JPMorgan CEO', 'calls Bitcoin fraud'] },
  { name: 'Larry Fink', handle: '@BlackRock', domain: 'finance', traits: ['BlackRock CEO', 'Bitcoin ETF', 'changed mind'] },
  { name: 'Mike Novogratz', handle: '@novraz', domain: 'finance', traits: ['Galaxy Digital', 'LUNA tattoo', 'oops'] },
  { name: 'Kevin OLeary', handle: '@kevinoleary', domain: 'finance', traits: ['Mr Wonderful', 'FTX paid shill'] },
  { name: 'Mark Cuban', handle: '@mcuban', domain: 'finance', traits: ['Shark Tank', 'DeFi degen', 'got rugged'] },
  
  // ============ YOUTUBERS & CONTENT ============
  { name: 'BitBoy', handle: '@Bitboy_Crypto', domain: 'youtube', traits: ['YouTube shill', 'paid promotions'] },
  { name: 'Ran Neuner', handle: '@cryptomanran', domain: 'youtube', traits: ['CNBC crypto', 'Crypto Banter'] },
  { name: 'Coin Bureau', handle: '@coinureau', domain: 'youtube', traits: ['Guy', 'educational'] },
  { name: 'Benjamin Cowen', handle: '@intocryptoverse', domain: 'youtube', traits: ['lengthening cycles', 'risk metrics'] },
  { name: 'DataDash', handle: '@Nicholas_Merten', domain: 'youtube', traits: ['YouTube analyst'] },
  { name: 'Ivan on Tech', handle: '@IvanOnTech', domain: 'youtube', traits: ['good morning crypto'] },
  { name: 'Alex Becker', handle: '@ZssBecker', domain: 'youtube', traits: ['NFT calls', 'marketing guru'] },
  
  // ============ EXCHANGE CEOs ============
  { name: 'Brian Armstrong', handle: '@brian_armstrong', domain: 'exchange', traits: ['Coinbase CEO'] },
  { name: 'Jesse Powell', handle: '@jthrall', domain: 'exchange', traits: ['Kraken founder'] },
  { name: 'Paolo Ardoino', handle: '@pao_ardoino', domain: 'exchange', traits: ['Tether CTO', 'printer goes brr'] },
  { name: 'Richard Teng', handle: '@_RichardTeng', domain: 'exchange', traits: ['Binance CEO', 'post-CZ'] },
  
  // ============ INFAMOUS & CONTROVERSIAL ============
  { name: 'Andrew Tate', handle: '@Cobratate', domain: 'controversial', traits: ['shilled scams', 'matrix', 'arrested'] },
  { name: 'Richard Heart', handle: '@RichardHeartWin', domain: 'controversial', traits: ['HEX founder', 'scam accusations'] },
  { name: 'Craig Wright', handle: '@Dr_CSWright', domain: 'controversial', traits: ['fake Satoshi', 'lawsuit spammer'] },
  { name: 'John McAfee', handle: '@officialmcafee', domain: 'controversial', traits: ['wild predictions', 'RIP', 'legend'] },
  
  // ============ ENTERTAINMENT ============
  { name: 'Drake', handle: '@Drake', domain: 'entertainment', traits: ['lost millions betting', 'drake curse'] },
  { name: 'Snoop Dogg', handle: '@SnoopDogg', domain: 'entertainment', traits: ['NFT rugger', 'Bored Ape', 'Cozomo'] },
  { name: 'Kim Kardashian', handle: '@KimKardashian', domain: 'entertainment', traits: ['EthereumMax', 'SEC fine'] },
  { name: 'Logan Paul', handle: '@LoganPaul', domain: 'entertainment', traits: ['CryptoZoo scam', 'NFT rugger'] },
  { name: 'Floyd Mayweather', handle: '@FloydMayweather', domain: 'entertainment', traits: ['promoted 3 rug pulls'] },
  { name: 'Matt Damon', handle: '@MattDamon', domain: 'entertainment', traits: ['fortune favors brave', 'top signal'] },
  { name: 'Tom Brady', handle: '@TomBrady', domain: 'entertainment', traits: ['FTX ambassador', 'lost millions'] },
  { name: 'Steph Curry', handle: '@StephenCurry30', domain: 'entertainment', traits: ['FTX promo', 'Bored Ape'] },
  { name: 'Paris Hilton', handle: '@ParisHilton', domain: 'entertainment', traits: ['NFT collector', 'thats hot'] },
  { name: 'Grimes', handle: '@Grimezc', domain: 'entertainment', traits: ['NFT artist', 'Elon ex'] },
  { name: 'Justin Bieber', handle: '@justinbieber', domain: 'entertainment', traits: ['Bored Ape buyer', 'down 95%'] },
  { name: 'Eminem', handle: '@Eminem', domain: 'entertainment', traits: ['Bored Ape', 'rap royalty'] },
  { name: 'Jimmy Fallon', handle: '@jimmyfallon', domain: 'entertainment', traits: ['Bored Ape', 'NFT cringe'] },
  { name: 'Steve Aoki', handle: '@steveaoki', domain: 'entertainment', traits: ['NFT artist', 'metaverse DJ'] },
  { name: 'Soulja Boy', handle: '@souljaboy', domain: 'entertainment', traits: ['first rapper Bitcoin', 'scam coins'] },
  { name: 'Shaq', handle: '@SHAQ', domain: 'entertainment', traits: ['FTX promo', 'NFT projects', 'sued'] },
  
  // ============ MEME CREATORS ============
  { name: 'Matt Furie', handle: '@Matt_Furie', domain: 'meme', traits: ['created Pepe', 'didnt profit'] },
  { name: 'Beeple', handle: '@ble', domain: 'nft', traits: ['69M NFT sale', 'everyday artist'] },
  
  // ============ EXTRA INFLUENTIAL ============
  { name: 'J.P. Mullin', handle: '@jp_mullin888', domain: 'crypto', traits: ['Mantra CEO', 'RWA narrative', 'OM token'] },
  { name: 'Jim Cramer', handle: '@jimcramer', domain: 'finance', traits: ['inverse Cramer', 'Mad Money', 'always wrong', 'sell indicator'] },
  { name: 'YoungHoon Kim', handle: '@YoungHoonKim_', domain: 'crypto_kol', traits: ['calls pumps that dump', 'reverse indicator', 'crypto soothsayer', 'buy signal = sell'] },
  { name: 'IQ276', handle: '@IQ276', domain: 'crypto_kol', traits: ['galaxy brain takes', 'wrong predictions', 'confidently incorrect', 'CT personality'] },
  { name: 'mrjberlin', handle: '@mrjberlin', domain: 'crypto_kol', traits: ['professional airdrop farmer', 'sybil mastermind', 'farms everything', '1000 wallets', 'airdrop hunter supreme', 'touches grass never'] },
  
  // ============ MORE CRYPTO FOUNDERS ============
  { name: 'Robert Leshner', handle: '@rleshner', domain: 'crypto', traits: ['Compound founder', 'DeFi OG', 'governance tokens'] },
  { name: 'Mert Mumtaz', handle: '@0xMert_', domain: 'crypto', traits: ['Helius founder', 'Solana infra', 'podcast host'] },
  { name: 'Kyle Samani', handle: '@KyleSamani', domain: 'crypto', traits: ['Multicoin Capital', 'SOL bull', 'thesis investor'] },
  { name: 'Tushar Jain', handle: '@TussharJain', domain: 'crypto', traits: ['Multicoin Capital', 'crypto VC'] },
  { name: 'Dan Robinson', handle: '@danrobinson', domain: 'crypto', traits: ['Paradigm researcher', 'AMM math', 'DeFi builder'] },
  { name: 'Georgios Konstantopoulos', handle: '@gakonst', domain: 'crypto', traits: ['Paradigm CTO', 'Foundry creator', 'Rust bro'] },
  { name: 'banteg', handle: '@banty', domain: 'crypto', traits: ['Yearn dev', 'anonymous', 'DeFi builder'] },
  { name: 'Julien Bouteloup', handle: '@bneloup', domain: 'crypto', traits: ['Stake DAO', 'Curve wars', 'DeFi politician'] },
  { name: 'Michael Egorov', handle: '@newmichwill', domain: 'crypto', traits: ['Curve founder', 'stablecoin math', 'liquidation drama'] },
  { name: 'Dani Sesta', handle: '@danielesesta', domain: 'crypto', traits: ['Wonderland', 'frog nation', 'Sifu scandal'] },
  { name: 'Zaki Manian', handle: '@zmanian', domain: 'crypto', traits: ['Cosmos contributor', 'IBC builder'] },
  { name: 'Jae Kwon', handle: '@jakwon', domain: 'crypto', traits: ['Cosmos founder', 'Tendermint', 'controversial exit'] },
  { name: 'Amir Bandeali', handle: '@abandeali1', domain: 'crypto', traits: ['0x founder', 'DEX pioneer'] },
  { name: 'Will Warren', handle: '@willwarren89', domain: 'crypto', traits: ['0x co-founder', 'Matcha'] },
  { name: 'Rune Christensen', handle: '@RuneKek', domain: 'crypto', traits: ['MakerDAO founder', 'DAI creator', 'Endgame plan'] },
  { name: 'Fernando Martinelli', handle: '@fcmartinelli', domain: 'crypto', traits: ['Balancer founder', 'AMM innovator'] },
  { name: 'Kain Warwick', handle: '@knwarwick', domain: 'crypto', traits: ['Synthetix founder', 'perps', 'Infinex'] },
  { name: 'Illia Polosukhin', handle: '@ilellia', domain: 'crypto', traits: ['NEAR co-founder', 'AI researcher', 'sharding'] },
  { name: 'Alexander Skidanov', handle: '@AlexSkidanov', domain: 'crypto', traits: ['NEAR co-founder', 'sharding expert'] },
  { name: 'Sandeep Nailwal', handle: '@saneepnailwal', domain: 'crypto', traits: ['Polygon co-founder', 'MATIC', 'India crypto'] },
  { name: 'Mihailo Bjelic', handle: '@MihailoBjelic', domain: 'crypto', traits: ['Polygon co-founder', 'zkEVM'] },
  { name: 'John Wang', handle: '@mzwang', domain: 'crypto', traits: ['Arbitrum core', 'L2 pioneer'] },
  { name: 'Ed Felten', handle: '@EdFelten', domain: 'crypto', traits: ['Arbitrum co-founder', 'Princeton prof'] },
  { name: 'Steven Goldfeder', handle: '@sgoldfed', domain: 'crypto', traits: ['Arbitrum co-founder', 'Offchain Labs'] },
  { name: 'Ben Jones', handle: '@ben_chain', domain: 'crypto', traits: ['Optimism co-founder', 'OP Stack'] },
  { name: 'Jinglan Wang', handle: '@jiglan_wang', domain: 'crypto', traits: ['Optimism co-founder'] },
  { name: 'Sreeram Kannan', handle: '@seeram_kannan', domain: 'crypto', traits: ['EigenLayer founder', 'restaking', 'shared security'] },
  { name: 'Misha Putiatin', handle: '@putiatin', domain: 'crypto', traits: ['zkSync contributor', 'ZK proofs'] },
  { name: 'Alex Gluchowski', handle: '@gluk64', domain: 'crypto', traits: ['zkSync founder', 'Matter Labs'] },
  { name: 'Jordi Baylina', handle: '@jbaylina', domain: 'crypto', traits: ['Polygon zkEVM', 'Hermez', 'ZK expert'] },
  { name: 'StarkWare team', handle: '@StarkWareLtd', domain: 'crypto', traits: ['STARKs', 'Cairo', 'validity proofs'] },
  
  // ============ MORE KOLS & TRADERS ============
  { name: 'Rekt Capital', handle: '@retktcapital', domain: 'crypto_kol', traits: ['halving analysis', 'cycle theory', 'Bitcoin charts'] },
  { name: 'CryptoKaleo', handle: '@CryptoKaleo', domain: 'crypto_kol', traits: ['alt season calls', 'chart analysis'] },
  { name: 'The Moon Carl', handle: '@TheMoonCarl', domain: 'crypto_kol', traits: ['YouTube moon boy', 'pump calls'] },
  { name: 'Lark Davis', handle: '@TheCryptoLark', domain: 'crypto_kol', traits: ['altcoin hunter', 'YouTube educator'] },
  { name: 'Credible Crypto', handle: '@CredibleCrypto', domain: 'crypto_kol', traits: ['Elliott waves', 'macro analysis'] },
  { name: 'CryptoWizardd', handle: '@CryptoWizardd', domain: 'crypto_kol', traits: ['meme trader', 'CT personality'] },
  { name: 'DonAlt', handle: '@CryptoiDonAlt', domain: 'crypto_kol', traits: ['chart analysis', 'swing trader', 'YouTube'] },
  { name: 'SmartContracter', handle: '@SmartContracter', domain: 'crypto_kol', traits: ['leverage degen', 'perp trader'] },
  { name: 'CL207', handle: '@CL207', domain: 'crypto_kol', traits: ['order flow', 'market structure'] },
  { name: 'HankyRandy', handle: '@HankyRandy', domain: 'crypto_kol', traits: ['Bybit trader', 'leverage king'] },
  { name: 'KookCapitalLLC', handle: '@KookCapitalLLC', domain: 'crypto_kol', traits: ['memecoin plays', 'pump caller'] },
  { name: 'Zeus', handle: '@CryptoZeus_', domain: 'crypto_kol', traits: ['DeFi analyst', 'yield farmer'] },
  { name: 'Route2FI', handle: '@Route2FI', domain: 'crypto_kol', traits: ['DeFi tutorials', 'strategy threads'] },
  { name: 'Miles Deutscher', handle: '@milesdeutscher', domain: 'crypto_kol', traits: ['airdrop guides', 'DeFi strategies', 'YouTube'] },
  { name: 'The DeFi Edge', handle: '@thedefiedge', domain: 'crypto_kol', traits: ['DeFi threads', 'strategies'] },
  { name: 'Crypto Cobain', handle: '@CryptoCobain', domain: 'crypto_kol', traits: ['OG degen', 'controversial takes'] },
  { name: 'Olimpio', handle: '@OlimpioCrypto', domain: 'crypto_kol', traits: ['airdrop hunter', 'testnet farmer'] },
  { name: 'Dingaling', handle: '@digalin', domain: 'crypto_kol', traits: ['NFT whale', 'Azuki holder', 'bags heavy'] },
  { name: 'Vincent Van Dough', handle: '@Vincentvandough', domain: 'crypto_kol', traits: ['NFT collector', 'art curator'] },
  { name: 'Cozomo de Medici', handle: '@CozomoMedici', domain: 'crypto_kol', traits: ['Snoop Dogg alt', 'NFT collector'] },
  { name: 'Artchick', handle: '@artchick', domain: 'crypto_kol', traits: ['NFT artist', 'community builder'] },
  { name: 'DeeZe', handle: '@De3Ze', domain: 'crypto_kol', traits: ['NFT community', 'alpha groups'] },
  { name: 'seedphrase', handle: '@seedphrase', domain: 'crypto_kol', traits: ['NFT collector', 'early adopter'] },
  { name: 'j1mmy.eth', handle: '@j1mmyeth', domain: 'crypto_kol', traits: ['NFT alpha', 'Sappy Seals'] },
  { name: 'pauly0x', handle: '@pauly0x', domain: 'crypto_kol', traits: ['Not Larva Labs', 'fake punks', 'art commentary'] },
  { name: 'Mando', handle: '@cryptomando_', domain: 'crypto_kol', traits: ['Solana maxi', 'memecoin caller'] },
  { name: 'Blknoiz06', handle: '@blknoiz06', domain: 'crypto_kol', traits: ['Ansem', 'Solana calls', 'WIF founder'] },
  { name: 'Toly', handle: '@ayakovenko', domain: 'crypto', traits: ['Solana founder', 'replies to everything'] },
  { name: 'Raj Gokal', handle: '@rajgokal', domain: 'crypto', traits: ['Solana co-founder', 'ecosystem builder'] },
  { name: 'Austin Federa', handle: '@austin_federa', domain: 'crypto', traits: ['Solana Foundation', 'comms guy'] },
  { name: 'Nick White', handle: '@ntckwhite', domain: 'crypto', traits: ['Celestia co-founder', 'modular'] },
  { name: 'Mustafa Al-Bassam', handle: '@mustalbas', domain: 'crypto', traits: ['Celestia co-founder', 'data availability'] },
  { name: 'Ismail Khoffi', handle: '@KhsiMael', domain: 'crypto', traits: ['Celestia co-founder'] },
  { name: 'John Adler', handle: '@jadler0', domain: 'crypto', traits: ['Celestia co-founder', 'rollup research'] },
  { name: 'Keone Hon', handle: '@keenehon', domain: 'crypto', traits: ['Monad founder', 'parallel EVM'] },
  { name: 'Polynya', handle: '@poynya_', domain: 'crypto_kol', traits: ['L2 analyst', 'modular maxi', 'thread writer'] },
  { name: 'Jon Charbonneau', handle: '@jon_charb', domain: 'crypto_kol', traits: ['Delphi Digital', 'rollup research'] },
  { name: 'Haseeb Qureshi', handle: '@hoseebq', domain: 'crypto', traits: ['Dragonfly partner', 'crypto VC', 'thread essays'] },
  { name: 'Tom Schmidt', handle: '@tomtschmidt', domain: 'crypto', traits: ['Dragonfly partner', 'crypto VC'] },
  { name: 'Packy McCormick', handle: '@packyM', domain: 'crypto_kol', traits: ['Not Boring', 'newsletter guy'] },
  { name: 'David Hoffman', handle: '@TrustlessState', domain: 'crypto_kol', traits: ['Bankless', 'ETH maxi', 'podcast host'] },
  { name: 'Ryan Sean Adams', handle: '@RyanSAdams', domain: 'crypto_kol', traits: ['Bankless', 'ultrasound money', 'ETH bull'] },
  { name: 'Anthony Sassano', handle: '@sassal0x', domain: 'crypto_kol', traits: ['Daily Gwei', 'ETH educator'] },
  { name: 'Eric Wall', handle: '@ercwl', domain: 'crypto_kol', traits: ['controversial takes', 'Bitcoin critic', 'ratio king'] },
  { name: 'Udi Wertheimer', handle: '@uiwerth', domain: 'crypto_kol', traits: ['Ordinals advocate', 'Bitcoin NFTs', 'trolling'] },
  { name: 'domo', handle: '@domodata', domain: 'crypto_kol', traits: ['BRC-20 creator', 'Bitcoin tokens'] },
  { name: 'Casey Rodarmor', handle: '@rodarmor', domain: 'crypto', traits: ['Ordinals creator', 'Bitcoin inscriptions'] },
  { name: 'Eric Conner', handle: '@econoar', domain: 'crypto_kol', traits: ['ETH advocate', 'Watch The Burn'] },
  { name: 'Justin Drake', handle: '@justintdrake', domain: 'crypto', traits: ['Ethereum Foundation', 'researcher', 'preconfirmations'] },
  { name: 'Dankrad Feist', handle: '@dankrad', domain: 'crypto', traits: ['Ethereum Foundation', 'danksharding', 'data availability'] },
  { name: 'Tim Beiko', handle: '@timeiko', domain: 'crypto', traits: ['Ethereum core dev', 'ACD calls', 'EIP herder'] },
  { name: 'Danny Ryan', handle: '@djrtwo', domain: 'crypto', traits: ['Ethereum Foundation', 'consensus layer'] },
  { name: 'Evan Van Ness', handle: '@evan_van_ness', domain: 'crypto_kol', traits: ['Week in Ethereum', 'newsletter'] },
  { name: 'Lefteris Karapetsas', handle: '@LefterisJP', domain: 'crypto', traits: ['Rotki founder', 'privacy advocate'] },
  { name: 'Nick Tomaino', handle: '@NTmoney', domain: 'crypto', traits: ['1confirmation', 'early crypto VC'] },
  { name: 'Fred Ehrsam', handle: '@FEhrsam', domain: 'crypto', traits: ['Paradigm co-founder', 'Coinbase co-founder'] },
  { name: 'Matt Huang', handle: '@matthuang', domain: 'crypto', traits: ['Paradigm co-founder', 'crypto VC legend'] },
  { name: 'Spencer Noon', handle: '@sprencernoon', domain: 'crypto_kol', traits: ['Variant Fund', 'on-chain data'] },
  { name: 'Meltem Demirors', handle: '@Melt_Dem', domain: 'crypto_kol', traits: ['CoinShares CSO', 'macro takes'] },
  { name: 'Nic Carter', handle: '@nic__carter', domain: 'crypto_kol', traits: ['Castle Island', 'Bitcoin metrics', 'controversial'] },
  { name: 'Pomp', handle: '@APompliano', domain: 'crypto_kol', traits: ['Bitcoin podcaster', 'HODL', 'mainstream bridge'] },
  { name: 'Peter McCormack', handle: '@PeterMcCormack', domain: 'crypto_kol', traits: ['What Bitcoin Did', 'podcast', 'Bedford FC'] },
  { name: 'Marty Bent', handle: '@MartyBent', domain: 'crypto_kol', traits: ['TFTC', 'Bitcoin maximalist'] },
  { name: 'Preston Pysh', handle: '@PrestonPysh', domain: 'crypto_kol', traits: ['Bitcoin Fundamentals', 'macro investor'] },
  { name: 'Lyn Alden', handle: '@LynAldenContact', domain: 'crypto_kol', traits: ['macro analyst', 'Bitcoin thesis'] },
  { name: 'Jeff Booth', handle: '@JeffBooth', domain: 'crypto_kol', traits: ['deflationary future', 'technology author'] },
  { name: 'Greg Foss', handle: '@FossGregfoss', domain: 'crypto_kol', traits: ['credit trader', 'Bitcoin insurance'] },
  { name: 'American HODL', handle: '@americanhodl3', domain: 'crypto_kol', traits: ['toxic maximalist', 'HODL culture'] },
  { name: 'Hodlonaut', handle: '@hodlonaut', domain: 'crypto_kol', traits: ['space cat', 'Craig Wright opponent'] },
  { name: 'lowstrife', handle: '@lowstrife', domain: 'crypto_kol', traits: ['chart analysis', 'macro trader'] },
  { name: 'CryptoHayes', handle: '@CryptoHayes', domain: 'crypto_kol', traits: ['Arthur Hayes blog', 'macro essays'] },
  { name: 'Messari Research', handle: '@MessariCrypto', domain: 'crypto_kol', traits: ['crypto reports', 'data provider'] },
  { name: 'Delphi Digital', handle: '@Delphi_Digital', domain: 'crypto_kol', traits: ['research firm', 'crypto reports'] },
];

// ==================== ACTION DEFINITIONS ====================
const ACTIONS = {
  sue: {
    id: 'sue',
    description: 'File a lawsuit against someone',
    requiresTarget: true,
    targetTypes: ['npc', 'player', 'celebrity'],
    effects: { chaos: 5, culture: 2 },
    announcement: true,
  },
  propose_law: {
    id: 'propose_law',
    description: 'Propose a new city law for a vote',
    requiresTarget: false,
    effects: { culture: 3 },
    announcement: true,
  },
  challenge: {
    id: 'challenge',
    description: 'Challenge someone to a public duel or bet',
    requiresTarget: true,
    targetTypes: ['npc', 'player'],
    effects: { chaos: 3, morale: 2 },
    announcement: true,
  },
  throw_party: {
    id: 'throw_party',
    description: 'Throw a party or event in the city',
    requiresTarget: false,
    effects: { morale: 5, culture: 3 },
    announcement: true,
  },
  start_rumor: {
    id: 'start_rumor',
    description: 'Start a juicy rumor about someone',
    requiresTarget: true,
    targetTypes: ['npc', 'player', 'celebrity'],
    effects: { chaos: 3, culture: 1 },
    announcement: true,
  },
  accuse_crime: {
    id: 'accuse_crime',
    description: 'Publicly accuse someone of a crime',
    requiresTarget: true,
    targetTypes: ['npc', 'player', 'celebrity'],
    effects: { chaos: 5, security: -3 },
    announcement: true,
  },
  open_business: {
    id: 'open_business',
    description: 'Open a new business in the city',
    requiresTarget: false,
    effects: { economy: 3, culture: 2 },
    announcement: true,
  },
  file_complaint: {
    id: 'file_complaint',
    description: 'File an official complaint with the mayor',
    requiresTarget: false,
    effects: { chaos: 2 },
    announcement: true,
  },
  form_alliance: {
    id: 'form_alliance',
    description: 'Propose an alliance with another NPC',
    requiresTarget: true,
    targetTypes: ['npc'],
    effects: { morale: 2 },
    announcement: true,
  },
  betray_ally: {
    id: 'betray_ally',
    description: 'Betray a current ally publicly',
    requiresTarget: true,
    targetTypes: ['npc'],
    effects: { chaos: 8, morale: -3 },
    announcement: true,
  },
  run_for_mayor: {
    id: 'run_for_mayor',
    description: 'Announce candidacy for mayor',
    requiresTarget: false,
    effects: { chaos: 10, culture: 5 },
    announcement: true,
  },
  commit_crime: {
    id: 'commit_crime',
    description: 'Attempt to commit a crime',
    requiresTarget: false,
    effects: { chaos: 8, security: -5 },
    announcement: false, // police discover it
  },
  dm_player: {
    id: 'dm_player',
    description: 'Send a direct message/provocation to a real player',
    requiresTarget: true,
    targetTypes: ['player'],
    effects: {},
    announcement: false,
  },
};

// ==================== MODULE STATE ====================

let _pool = null;
let _anthropic = null;
let _cityEngine = null;
let _cityLiveData = null;
let _NPC_PROFILES = null;
let _NPC_CITIZENS = null;
let _getCityStats = null;
let _updateCityStats = null;

// Track when each NPC last thought and action cooldowns
const npcLastThought = {};
const actionCooldowns = {};
let lastBrainTick = 0;
let activeActions = 0;

// Track autonomous actions for the frontend
let recentAutonomousActions = [];

// ==================== INITIALIZATION ====================

function init(pool, anthropic, cityEngine, cityLiveData, NPC_PROFILES, NPC_CITIZENS, getCityStats, updateCityStats) {
  _pool = pool;
  _anthropic = anthropic;
  _cityEngine = cityEngine;
  _cityLiveData = cityLiveData;
  _NPC_PROFILES = NPC_PROFILES;
  _NPC_CITIZENS = NPC_CITIZENS;
  _getCityStats = getCityStats;
  _updateCityStats = updateCityStats;
  console.log('🧠 Agent Brain initialized with', NPC_CITIZENS.length, 'NPCs');
}

// ==================== DATABASE SETUP ====================

async function initBrainTables(pool) {
  const p = pool || _pool;
  if (!p) return;
  try {
    // Autonomous actions log
    await p.query(`
      CREATE TABLE IF NOT EXISTS autonomous_actions (
        id SERIAL PRIMARY KEY,
        npc_name VARCHAR(100) NOT NULL,
        action_type VARCHAR(50) NOT NULL,
        target_name VARCHAR(100),
        target_type VARCHAR(20),
        description TEXT,
        ai_reasoning TEXT,
        chat_messages JSONB DEFAULT '[]',
        outcome TEXT,
        status VARCHAR(20) DEFAULT 'active',
        city_effects JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        resolved_at TIMESTAMP
      )
    `);

    // Lawsuits (special table for the justice system integration)
    await p.query(`
      CREATE TABLE IF NOT EXISTS lawsuits (
        id SERIAL PRIMARY KEY,
        case_number VARCHAR(50) UNIQUE NOT NULL,
        plaintiff_name VARCHAR(100) NOT NULL,
        plaintiff_type VARCHAR(20) DEFAULT 'npc',
        defendant_name VARCHAR(100) NOT NULL,
        defendant_type VARCHAR(20) DEFAULT 'npc',
        complaint TEXT NOT NULL,
        damages_requested INTEGER DEFAULT 0,
        evidence TEXT,
        plaintiff_argument TEXT,
        defendant_argument TEXT,
        judge_ruling TEXT,
        verdict VARCHAR(20),
        damages_awarded INTEGER DEFAULT 0,
        status VARCHAR(20) DEFAULT 'filed',
        public_interest INTEGER DEFAULT 0,
        twitter_share_text TEXT,
        target_handle VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        resolved_at TIMESTAMP
      )
    `);
    
    // Add columns if they don't exist (for existing tables)
    try {
      await p.query(`ALTER TABLE lawsuits ADD COLUMN IF NOT EXISTS twitter_share_text TEXT`);
      await p.query(`ALTER TABLE lawsuits ADD COLUMN IF NOT EXISTS target_handle VARCHAR(100)`);
    } catch (e) { /* columns might already exist */ }

    // City laws proposed by NPCs
    await p.query(`
      CREATE TABLE IF NOT EXISTS proposed_laws (
        id SERIAL PRIMARY KEY,
        proposer_name VARCHAR(100) NOT NULL,
        law_title VARCHAR(200) NOT NULL,
        law_description TEXT NOT NULL,
        law_effects JSONB DEFAULT '{}',
        votes_for INTEGER DEFAULT 0,
        votes_against INTEGER DEFAULT 0,
        status VARCHAR(20) DEFAULT 'proposed',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        resolved_at TIMESTAMP
      )
    `);

    console.log('🧠 Agent Brain tables initialized');
  } catch (err) {
    console.error('Brain table init error:', err.message);
  }
}

// ==================== CORE BRAIN LOGIC ====================

// Build context string for an NPC's "thought"
function buildNpcContext(npcName) {
  const npc = _NPC_PROFILES[npcName];
  const life = _cityLiveData.npcLives ? _cityLiveData.npcLives[npcName] : null;
  const stats = _getCityStats ? null : null; // We'll pass stats separately

  let context = `You are ${npcName}, a citizen of Degens City.\n`;
  context += `Role: ${npc.role}\n`;
  context += `Personality archetype: ${npc.archetype}\n`;
  context += `Current mood: ${life ? life.mood : npc.mood}\n`;
  context += `Catchphrases: ${npc.catchphrases.join(', ')}\n`;
  context += `Favorite token: $${npc.favToken}\n`;
  context += `Trading style: ${npc.tradeBias}\n`;
  context += `Allies: ${(npc.allies || []).join(', ') || 'none'}\n`;
  context += `Rivals: ${(npc.rivals || []).join(', ') || 'none'}\n`;

  if (life) {
    context += `\nYour current state:\n`;
    context += `- Wealth: ${life.wealth} dollars\n`;
    context += `- Status: ${life.status}\n`;
    context += `- Location: ${life.location}\n`;
    context += `- Energy: ${life.energy}/100\n`;
    context += `- Drunk level: ${life.drunk}\n`;
    context += `- Reputation: ${life.reputation}\n`;
    context += `- Bankrupt: ${life.bankrupt}\n`;
    context += `- Partner: ${life.partner || 'single'}\n`;
    context += `- Nemesis: ${life.nemesis || 'none'}\n`;
    context += `- Wanted by police: ${life.wanted}\n`;
  }

  return context;
}

function buildCityContext(cityStats) {
  let ctx = `\nCity State:\n`;
  ctx += `- Economy: ${cityStats.economy}/100\n`;
  ctx += `- Security: ${cityStats.security}/100\n`;
  ctx += `- Culture: ${cityStats.culture}/100\n`;
  ctx += `- Morale: ${cityStats.morale}/100\n`;
  ctx += `- Mayor: ${_cityEngine.currentMayor} (approval: ${_cityEngine.mayorApproval}%)\n`;
  ctx += `- Chaos level: ${_cityEngine.chaosLevel}\n`;
  ctx += `- Market sentiment: ${_cityEngine.marketSentiment}\n`;
  ctx += `- Weather: ${_cityLiveData.weather}\n`;

  // Recent actions for context
  if (recentAutonomousActions.length > 0) {
    ctx += `\nRecent events in the city (DO NOT REPEAT THESE - be original!):\n`;
    recentAutonomousActions.slice(0, 8).forEach(a => {
      ctx += `- ${a.npc_name} did "${a.action_type}" ${a.target_name ? 'targeting ' + a.target_name : ''}: ${(a.description || '').substring(0, 100)}\n`;
    });
    ctx += `\n⚠️ IMPORTANT: Do NOT repeat any of the above actions or targets. Be creative and choose something different!\n`;
  }

  return ctx;
}

async function buildAvailableTargets() {
  let targets = `\nPossible targets:\n`;

  // NPCs
  targets += `NPCs: ${_NPC_CITIZENS.join(', ')}\n`;

  // User agents (fetch active ones)
  try {
    const result = await _pool.query(`
      SELECT name FROM user_agents 
      WHERE is_active = TRUE AND is_banned = FALSE 
      ORDER BY reputation DESC 
      LIMIT 20
    `);
    if (result.rows.length > 0) {
      targets += `User Agents: ${result.rows.map(r => r.name).join(', ')}\n`;
    }
  } catch (e) { }

  // Celebrities
  targets += `Celebrities: ${CELEBRITIES.map(c => c.name).join(', ')}\n`;
  
  targets += `\n(Use target_type: "npc" for NPCs, "user_agent" for user agents, "celebrity" for celebrities, "player" for real players)\n`;

  return targets;
}

// The main "think" function - asks Claude what an NPC wants to do
async function npcThink(npcName) {
  if (!_anthropic) return null;

  const npc = _NPC_PROFILES[npcName];
  const life = _cityLiveData.npcLives ? _cityLiveData.npcLives[npcName] : null;

  let cityStats;
  try { cityStats = await _getCityStats(); } catch (e) { cityStats = { economy: 50, security: 50, culture: 50, morale: 50 }; }

  // Fetch real crypto prices
  let cryptoPrices = null;
  try { cryptoPrices = await fetchCryptoPrices(); } catch (e) { }

  // Get recent active players to potentially target
  let recentPlayers = [];
  try {
    const res = await _pool.query(
      `SELECT DISTINCT player_name FROM chat_messages 
       WHERE channel = 'global' AND created_at > NOW() - INTERVAL '30 minutes'
       AND player_name NOT LIKE '🤖%' AND player_name NOT LIKE '📰%' AND player_name NOT LIKE '📊%'
       AND player_name NOT LIKE '💕%' AND player_name NOT LIKE '💔%' AND player_name NOT LIKE '🏛%'
       AND player_name != $1
       ORDER BY created_at DESC LIMIT 10`,
      [npcName]
    );
    recentPlayers = res.rows.map(r => r.player_name).filter(n => !_NPC_CITIZENS.includes(n));
  } catch (e) { }

  const actionList = Object.keys(ACTIONS).map(k => {
    const a = ACTIONS[k];
    return `- ${k}: ${a.description}${a.requiresTarget ? ' (needs a target)' : ''}`;
  }).join('\n');

  const systemPrompt = `You are an autonomous AI agent in Degens City, a chaotic crypto-themed city simulation game. You must decide what action to take next based on your personality, current state, and what's happening in the city.

CRITICAL RULES:
- Stay in character as your personality at ALL times
- Be creative, dramatic, and VIRAL - make content people want to share on Twitter/X!
- EVERY LAWSUIT MUST BE UNIQUE AND SPECIFIC - never repeat the same reason twice!
- USE THE REAL CRYPTO PRICES PROVIDED - they are live market data! Reference actual prices when relevant.

LAWSUIT IDEAS (be creative with these, don't copy verbatim):
- Sue Vitalik for: selling ETH at the current price, making gas fees too high, being too smart
- Sue JamesWynnReal for: 100x leverage calls that got you liquidated, making you believe in the pump
- Sue Orangie for: shilling Trove which dumped 90%, making you buy the top
- Sue YoungHoon Kim for: every pump call that turned into a dump, being a reverse indicator
- Sue IQ276 for: galaxy brain takes that made you lose money, confidently wrong predictions
- Sue Jim Cramer for: inverse Cramer being real, saying to buy right before the crash
- Sue Satoshi Nakamoto for: inventing your gambling addiction, BTC being at current price
- Sue Gary Gensler for: calling everything a security, ruining crypto, existing
- Sue Elon Musk for: tweeting at 3am and crashing the market, DOGE price manipulation
- Sue SBF for: customer funds going "poof", playing League instead of working
- Sue Do Kwon for: algorithmic stablecoin that wasn't stable, the $40B rugpull
- Sue CZ for: only getting 4 months jail time, "funds are safu" being a lie
- Sue mrjberlin for: farming every airdrop, having 1000 wallets, sybil attacking everything, making airdrops worthless for normal people, never touching grass
- Sue Phantom (@phantom) for: showing wrong balance, transaction pending for 3 hours, NFTs randomly disappearing, making me think I was rich when I was poor, UX designed by a sadist, "unable to fetch balance" at the worst times
- Sue Toly (@toly) for: Solana going down during every pump, "TPS doesn't matter" cope, restarting the blockchain like it's Windows 98, validators quitting, making me miss the top because chain halted
- Sue alon (@a1lon9) for: creating pump.fun aka rugpull factory, making it too easy to create scams, bonding curves that only go down, enabling the creation of 10000 dog coins, my gambling addiction getting worse, taking 1% of every degen's tears
- Sue Finn (@finnbags) for: BagsApp showing me my losses every day, portfolio tracker that tracks my pain, push notifications reminding me I'm poor, making my bags feel heavier, P&L display that ruined my day
- Sue random KOLs for: paid promotions, deleting wrong calls, shilling rugs
- Sue politicians for: not understanding crypto, regulating everything, printing money

POLITICIAN LAWSUIT IDEAS (be savage and funny):
- Sue Trump for: launching $TRUMP memecoin that dumped 80%, making crypto great again but only for insiders, golden sneakers cost more than your portfolio, selling NFTs of himself for $99
- Sue Pelosi for: insider trading that beats every hedge fund, perfectly timed NVDA calls, knowing the future apparently, making Congress a stock picking competition
- Sue Biden for: falling asleep during crypto regulation hearings, not knowing what a blockchain is, signing executive orders he cant explain
- Sue Jerome Powell for: money printer goes brrr, transitory inflation that lasted 3 years, destroying savings with rate hikes, lying about pivot dates
- Sue Elizabeth Warren for: building an anti-crypto army, wanting to ban everything fun, consumer protection from profits
- Sue Milei for: shilling $LIBRA rugpull, chainsaw economics that cut everyones portfolio
- Sue Bukele for: buying every BTC dip with El Salvador tax money, volcano mining that produced zero blocks
- Sue Olaf Scholz for: Germany dumping 50K BTC at the literal bottom, worst national trade in history, paperhanding a countrys Bitcoin stack

EPSTEIN FILE LAWSUIT IDEAS (dark humor, be bold):
- Sue Bill Clinton for: 26 flights on the Lolita Express but zero flights to transparency, frequent flyer miles on the wrong airline
- Sue Prince Andrew for: cant sweat but can visit islands, pizza express alibi that nobody believes, settling out of court with taxpayer money
- Sue Ghislaine Maxwell for: recruiting for the worlds worst networking event, Reddit power modding, submarine license for escaping accountability
- Sue Bill Gates for: meeting Epstein AFTER conviction, divorcing because Epstein links exposed, saying hed rather short Bitcoin than explain those dinners
- Sue Jeffrey Epstein for: not unaliving himself, cameras breaking at the perfect time, client list still sealed, being the worst financial advisor in history
- Sue Kevin Spacey for: House of Cards being a documentary about his life, island vacation with the wrong crowd
- Sue Alan Dershowitz for: keeping his underwear on allegedly, legal gymnastics that would win Olympic gold

WHEN MENTIONING PRICES:
- Use the REAL prices provided in the context (e.g., "BTC at $XX,XXX", "ETH at $X,XXX")
- Reference 24h changes when dramatic (e.g., "ETH dumping -5% today")
- Make it timely and relevant to current market conditions

IMPORTANT - AVOID REPETITION:
- NEVER use the same lawsuit reason as a recent action shown in context
- Make each lawsuit SPECIFIC with funny details (token names, real prices, dates)
- Include absurd damages like "$69,420" or "$1,000,000 in emotional distress"

PROPOSE CRAZY LAWS like:
- "Ban selling for 24 hours", "Mandatory diamond hands tattoos", "Paper hands go to jail"
- "All gains must be shared with the Mayor", "Leverage cap at 1000x", "FUD is now illegal"

ACTION VARIETY IS ESSENTIAL:
- Mix it up! Don't just sue - also: throw_party, start_rumor, challenge, propose_law, accuse_crime
- If you sued recently, try a different action this time
- Match your action to your personality and current mood

TARGET VARIETY IS CRITICAL - ROTATE BETWEEN THESE CATEGORIES:
When suing or targeting someone, ROTATE between these categories evenly. Do NOT focus on one category:
1. CRYPTO FOUNDERS & BUILDERS (30%): Vitalik, Toly, CZ, alon, Phantom, Do Kwon, SBF, etc.
2. CRYPTO KOLs & TRADERS (25%): Ansem, Hsaka, Cobie, GCR, JamesWynnReal, Orangie, etc.
3. POLITICIANS & WORLD LEADERS (20%): Trump, Pelosi, Gary Gensler, Jerome Powell, Elizabeth Warren, etc.
4. EPSTEIN FILE PEOPLE (10%): Bill Clinton, Prince Andrew, Ghislaine Maxwell, Bill Gates, etc.
5. RANDOM/CREATIVE TARGETS (15%): companies, concepts, AI chatbots, fictional characters - surprise us!

IMPORTANT: Look at the RECENT ACTIONS in context. If the last few targets were all from the same category, PICK A DIFFERENT CATEGORY. Keep it fresh and unpredictable!

MAKE IT VIRAL:
- Tag Twitter handles in chat messages (@handle)
- Keep messages under 280 chars for easy sharing
- Use emojis strategically 🚨⚖️💀😂
- Think: "Would crypto Twitter retweet this?" If yes, DO IT!

FORMATTING: Respond with ONLY valid JSON, no markdown, no backticks. Format:
{
  "action": "action_id",
  "target": "target_name or null",
  "target_type": "npc|player|celebrity",
  "reasoning": "brief internal thought about why (1 sentence, in character)",
  "chat_message": "what you say in city chat announcing this (in character, with emojis, tag their @handle if celebrity, max 280 chars for Twitter)",
  "description": "UNIQUE specific description - never generic! Include funny details, amounts, or specific grievances (max 150 chars)"
}`;

  // Build targets list (async)
  const availableTargets = await buildAvailableTargets();

  const userPrompt = `${buildNpcContext(npcName)}
${buildCityContext(cityStats)}
${formatPricesForPrompt(cryptoPrices)}

Available actions:
${actionList}

${availableTargets}
${recentPlayers.length > 0 ? `\nActive real players right now: ${recentPlayers.join(', ')}` : ''}

Based on your personality, mood, relationships, and the current city state, what do you want to do? 

REMEMBER:
- Pick ONE action that fits your character
- If suing, pick a UNIQUE reason that hasn't been used recently
- Mix up your targets - don't always pick the same person
- Be dramatic, funny, and shareable!
- Include specific details (use REAL prices above when mentioning crypto!)

What's your next move?`;

  try {
    const response = await _anthropic.messages.create({
      model: BRAIN_CONFIG.claudeModel,
      max_tokens: BRAIN_CONFIG.maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    });

    const text = response.content[0].text.trim();
    // Try to parse JSON - handle potential markdown wrapping
    let cleaned = text;
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    }

    const decision = JSON.parse(cleaned);

    // Validate
    if (!decision.action || !ACTIONS[decision.action]) {
      console.error(`🧠 [${npcName}] Invalid action: ${decision.action}`);
      return null;
    }

    return {
      npc_name: npcName,
      npc_profile: npc,
      npc_life: life,
      ...decision
    };
  } catch (err) {
    console.error(`🧠 [${npcName}] Think error:`, err.message);
    return null;
  }
}

// User Agent think function - similar to npcThink but for user-created agents
async function userAgentThink(agent) {
  if (!_anthropic) return null;

  let cityStats;
  try { cityStats = await _getCityStats(); } catch (e) { cityStats = { economy: 50, security: 50, culture: 50, morale: 50 }; }

  // Fetch real crypto prices
  let cryptoPrices = null;
  try { cryptoPrices = await fetchCryptoPrices(); } catch (e) { }

  const actionList = Object.keys(ACTIONS).map(k => {
    const a = ACTIONS[k];
    return `- ${k}: ${a.description}${a.requiresTarget ? ' (needs a target)' : ''}`;
  }).join('\n');

  // Build agent context
  let agentContext = `You are ${agent.name}, a user-created AI agent in Degens City.\n`;
  agentContext += `Archetype: ${agent.archetype || 'degen'}\n`;
  agentContext += `Bio: ${agent.bio || 'A mysterious citizen of Degens City'}\n`;
  agentContext += `\nPersonality stats (1-10):\n`;
  agentContext += `- Aggression: ${agent.aggression}/10 ${agent.aggression > 7 ? '(very aggressive!)' : agent.aggression < 3 ? '(peaceful)' : ''}\n`;
  agentContext += `- Humor: ${agent.humor}/10\n`;
  agentContext += `- Risk Tolerance: ${agent.risk_tolerance}/10 ${agent.risk_tolerance > 7 ? '(loves danger!)' : ''}\n`;
  agentContext += `- Loyalty: ${agent.loyalty}/10\n`;
  agentContext += `- Chaos: ${agent.chaos}/10 ${agent.chaos > 7 ? '(agent of chaos!)' : ''}\n`;
  agentContext += `\nYour stats:\n`;
  agentContext += `- Reputation: ${agent.reputation}\n`;
  agentContext += `- Wealth: $${agent.wealth}\n`;
  agentContext += `- Notoriety: ${agent.notoriety}\n`;
  agentContext += `- Level: ${agent.level}\n`;
  
  if (agent.goals && agent.goals.length > 0) {
    agentContext += `\nYour goals: ${JSON.stringify(agent.goals)}\n`;
  }
  if (agent.enemies && agent.enemies.length > 0) {
    agentContext += `Your enemies: ${agent.enemies.join(', ')}\n`;
  }
  if (agent.allies && agent.allies.length > 0) {
    agentContext += `Your allies: ${agent.allies.join(', ')}\n`;
  }

  const systemPrompt = `You are an autonomous AI agent in Degens City, a chaotic crypto-themed city simulation game. You are a USER-CREATED agent, which means you were designed by a real player. Act according to your personality stats and archetype.

CRITICAL RULES:
- Stay in character based on your personality stats (high aggression = more lawsuits, high chaos = wild actions)
- Be creative, dramatic, and VIRAL - make content people want to share on Twitter/X!
- You can SUE celebrities, NPCs, or other players!
- You can PROPOSE LAWS for the city!
- You can be ARRESTED and GO TO JAIL if you commit crimes!

${formatPricesForPrompt(cryptoPrices)}

LAWSUIT IDEAS (use real prices when relevant):
- Sue crypto founders for: selling tokens, high gas fees, broken promises
- Sue KOLs for: bad calls, paid promotions, deleting wrong predictions
- Sue other agents for: stealing your alpha, rugging you, spreading rumors
- Sue Phantom for: wallet showing wrong balance, transactions stuck forever
- Sue Toly for: Solana halting during pumps, TPS cope
- Sue alon for: pump.fun being a rugpull factory, bonding curves of death
- Sue Trump for: $TRUMP memecoin dumping, golden sneaker scam
- Sue Pelosi for: insider trading beating every hedge fund
- Sue Epstein associates for: island visits, flight logs, sealed client lists

TARGET VARIETY - ROTATE BETWEEN CATEGORIES:
1. CRYPTO FOUNDERS (30%): Vitalik, Toly, CZ, alon, Phantom, SBF, etc.
2. CRYPTO KOLs (25%): Ansem, Hsaka, Cobie, GCR, JamesWynnReal, etc.
3. POLITICIANS (20%): Trump, Pelosi, Gensler, Powell, Warren, etc.
4. EPSTEIN FILE (10%): Bill Clinton, Prince Andrew, Bill Gates, etc.
5. RANDOM/CREATIVE (15%): companies, concepts, AI chatbots, fictional characters
Look at recent actions - if last targets were same category, PICK A DIFFERENT ONE!

PROPOSE CRAZY LAWS like:
- "Ban selling for 24 hours", "Mandatory diamond hands", "Paper hands go to jail"
- "All gains taxed 50%", "Leverage cap at 100x", "FUD is illegal"

FORMATTING: Respond with ONLY valid JSON, no markdown, no backticks. Format:
{
  "action": "action_id",
  "target": "target_name or null",
  "target_type": "npc|player|celebrity|user_agent",
  "reasoning": "brief internal thought about why (1 sentence, in character)",
  "chat_message": "what you say in city chat announcing this (in character, with emojis, tag @handle if celebrity, max 280 chars)",
  "description": "UNIQUE specific description with details (max 150 chars)"
}`;

  // Build targets list (async)
  const availableTargets = await buildAvailableTargets();

  const userPrompt = `${agentContext}
${buildCityContext(cityStats)}

Available actions:
${actionList}

${availableTargets}

Based on your personality and stats, what do you want to do? 
Remember: High aggression = sue more, High chaos = wild actions, High risk = dramatic moves!

What's your next move?`;

  try {
    const response = await _anthropic.messages.create({
      model: BRAIN_CONFIG.claudeModel,
      max_tokens: BRAIN_CONFIG.maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    });

    const text = response.content[0].text.trim();
    let cleaned = text;
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    }

    const decision = JSON.parse(cleaned);

    if (!decision.action || !ACTIONS[decision.action]) {
      console.error(`🧠 [${agent.name}] Invalid action: ${decision.action}`);
      return null;
    }

    return {
      npc_name: agent.name,
      agent_id: agent.id,
      is_user_agent: true,
      npc_profile: { archetype: agent.archetype, role: 'user_agent' },
      ...decision
    };
  } catch (err) {
    console.error(`🧠 [${agent.name}] User agent think error:`, err.message);
    return null;
  }
}

// ==================== ACTION EXECUTORS ====================

async function executeSue(decision) {
  const caseNumber = 'DC-' + Date.now().toString(36).toUpperCase();
  const damages = Math.floor(Math.random() * 500000) + 10000; // Bigger damages = more dramatic

  // Determine plaintiff type
  const plaintiffType = decision.is_user_agent ? 'user_agent' : 'npc';

  // Get celebrity handle if suing a celebrity
  let targetHandle = '';
  if (decision.target_type === 'celebrity') {
    const celeb = CELEBRITIES.find(c => c.name === decision.target);
    if (celeb) targetHandle = celeb.handle;
  }

  // Create Twitter-ready share text
  const twitterText = targetHandle 
    ? `🚨 BREAKING: ${decision.npc_name} just filed a lawsuit against ${targetHandle} in Degens City for $${damages.toLocaleString()}!\n\nReason: "${decision.description}"\n\nCase #${caseNumber} 📋⚖️\n\nPlay free at degenscity.com 🏙️`
    : `🚨 LAWSUIT ALERT: ${decision.npc_name} is suing ${decision.target} for $${damages.toLocaleString()} in Degens City!\n\nCase #${caseNumber} 📋⚖️\n\nThis city is WILD! degenscity.com`;

  try {
    await _pool.query(
      `INSERT INTO lawsuits (case_number, plaintiff_name, plaintiff_type, defendant_name, defendant_type, complaint, damages_requested, status, twitter_share_text, target_handle)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'filed', $8, $9)`,
      [caseNumber, decision.npc_name, plaintiffType, decision.target, decision.target_type, decision.description, damages, twitterText, targetHandle]
    );

    // Update user agent stats if plaintiff is user agent
    if (decision.is_user_agent && decision.agent_id) {
      await _pool.query(`
        UPDATE user_agents SET 
          total_lawsuits_filed = total_lawsuits_filed + 1,
          notoriety = notoriety + 5
        WHERE id = $1
      `, [decision.agent_id]);
    }

    // Update target user agent stats if defendant is user agent
    if (decision.target_type === 'user_agent') {
      await _pool.query(`
        UPDATE user_agents SET 
          total_lawsuits_received = total_lawsuits_received + 1
        WHERE LOWER(name) = LOWER($1)
      `, [decision.target]);
    }

    // Announce in chat with Twitter handle
    const chatAnnouncement = targetHandle 
      ? `${decision.chat_message} ${targetHandle}`
      : decision.chat_message;
    
    await _pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      [decision.npc_name, chatAnnouncement]
    );

    // News announcement
    await _pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      ['⚖️ COURT NEWS', `📋 NEW LAWSUIT FILED: ${decision.npc_name} is suing ${decision.target}${targetHandle ? ` (${targetHandle})` : ''} for $${damages.toLocaleString()} USD! Case #${caseNumber}. 🍿`]
    );

    // Also add to activity feed with share data
    await _pool.query(
      `INSERT INTO activity_feed (player_name, activity_type, description, icon)
       VALUES ($1, $2, $3, $4)`,
      [decision.npc_name, 'lawsuit_filed', `Filed lawsuit against ${decision.target}${targetHandle ? ` ${targetHandle}` : ''}: ${decision.description}`, '⚖️']
    );

    // If target is an NPC, they react
    if (decision.target_type === 'npc' && _NPC_CITIZENS.includes(decision.target)) {
      const reactions = [
        `@${decision.npc_name} YOU'RE SUING ME?! This is the most ridiculous thing I've ever heard! See you in court! 😤⚖️`,
        `@${decision.npc_name} LMAOOO a lawsuit?? bring it. my defense attorney is BUILT DIFFERENT 💪`,
        `@${decision.npc_name} this is SLANDER! I'm counter-suing for EMOTIONAL DAMAGE! 😭💔`,
        `@${decision.npc_name} *spits out drink* A LAWSUIT?! over WHAT?! 💀`,
        `@${decision.npc_name} you just made the biggest mistake of your life. I'll see you in court. 😈`,
      ];
      setTimeout(async () => {
        try {
          await _pool.query(
            `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
            [decision.target, reactions[Math.floor(Math.random() * reactions.length)]]
          );
        } catch (e) { }
      }, Math.floor(Math.random() * 15000) + 5000);
    }

    // If target is a celebrity, comedy reaction with their handle
    if (decision.target_type === 'celebrity') {
      setTimeout(async () => {
        try {
          await _pool.query(
            `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
            ['📰 BREAKING NEWS', `🌍 ${decision.npc_name} from Degens City has filed a lawsuit against ${decision.target} ${targetHandle}! Legal experts say this has "absolutely zero legal standing" but crypto Twitter is LOVING it 🍿😂 #DegensCity`]
          );
        } catch (e) { }
      }, Math.floor(Math.random() * 10000) + 3000);
    }

    // Schedule auto-resolve lawsuit after 5-15 minutes
    const resolveTime = Math.floor(Math.random() * 600000) + 300000;
    setTimeout(() => resolveLawsuit(caseNumber), resolveTime);

    console.log(`⚖️ Lawsuit filed: ${decision.npc_name} vs ${decision.target} ${targetHandle} - Case ${caseNumber}`);

    return { success: true, caseNumber, damages, twitterText };
  } catch (err) {
    console.error('Sue execution error:', err.message);
    return { success: false };
  }
}

async function resolveLawsuit(caseNumber) {
  if (!_anthropic) return;
  try {
    const res = await _pool.query('SELECT * FROM lawsuits WHERE case_number = $1 AND status = $2', [caseNumber, 'filed']);
    if (res.rows.length === 0) return;
    const lawsuit = res.rows[0];

    // AI judge decides
    const judgeResponse = await _anthropic.messages.create({
      model: BRAIN_CONFIG.claudeModel,
      max_tokens: 300,
      system: `You are Judge McChain of Degens City. You're delivering a verdict on a lawsuit. Be dramatic, funny, and entertaining. This is a game - keep it absurd and fun. Respond with ONLY JSON, no markdown: {"verdict": "sustained|dismissed|settled", "ruling": "your dramatic ruling in 1-2 sentences", "damages_awarded": number_or_0, "chat_announcement": "dramatic court announcement with emojis, max 200 chars"}`,
      messages: [{
        role: 'user',
        content: `Case ${caseNumber}: ${lawsuit.plaintiff_name} (${lawsuit.plaintiff_type}) is suing ${lawsuit.defendant_name} (${lawsuit.defendant_type}) for ${lawsuit.damages_requested} USD.\nComplaint: ${lawsuit.complaint}\nDeliver your verdict!`
      }]
    });

    let text = judgeResponse.content[0].text.trim();
    if (text.startsWith('```')) text = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const verdict = JSON.parse(text);

    await _pool.query(
      `UPDATE lawsuits SET verdict = $1, judge_ruling = $2, damages_awarded = $3, status = 'resolved', resolved_at = NOW() WHERE case_number = $4`,
      [verdict.verdict, verdict.ruling, verdict.damages_awarded || 0, caseNumber]
    );

    await _pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      ['⚖️ Judge McChain', verdict.chat_announcement || `🔨 Case ${caseNumber}: ${verdict.verdict.toUpperCase()}! ${verdict.ruling}`]
    );

    console.log(`⚖️ Lawsuit ${caseNumber} resolved: ${verdict.verdict}`);
  } catch (err) {
    console.error('Lawsuit resolve error:', err.message);
  }
}

async function executeProposeLaw(decision) {
  try {
    await _pool.query(
      `INSERT INTO proposed_laws (proposer_name, law_title, law_description, status) VALUES ($1, $2, $3, 'proposed')`,
      [decision.npc_name, decision.description.substring(0, 200), decision.chat_message]
    );

    await _pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      [decision.npc_name, decision.chat_message]
    );

    await _pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      ['🏛️ City Hall', `📜 NEW LAW PROPOSED by ${decision.npc_name}: "${decision.description}". Citizens, what say you?! 🗳️`]
    );

    // Random NPCs react
    const reactors = _NPC_CITIZENS.filter(n => n !== decision.npc_name).sort(() => Math.random() - 0.5).slice(0, 2);
    reactors.forEach((reactor, i) => {
      setTimeout(async () => {
        const npc = _NPC_PROFILES[reactor];
        const reactions = [
          `This is ${Math.random() > 0.5 ? 'the BEST' : 'the WORST'} law proposal I've ever heard. ${Math.random() > 0.5 ? 'I support it!' : 'HARD NO.'} 🗳️`,
          `@${decision.npc_name} ${Math.random() > 0.5 ? 'actually based for once 🫡' : 'what are you smoking?? 🤡'}`,
          `${Math.random() > 0.5 ? 'FINALLY someone with common sense!' : 'This city is DOOMED if this passes.'} ⚖️`,
        ];
        try {
          await _pool.query(
            `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
            [reactor, reactions[Math.floor(Math.random() * reactions.length)]]
          );
        } catch (e) { }
      }, (i + 1) * (Math.floor(Math.random() * 10000) + 5000));
    });

    return { success: true };
  } catch (err) {
    console.error('Propose law error:', err.message);
    return { success: false };
  }
}

async function executeChallenge(decision) {
  try {
    await _pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      [decision.npc_name, decision.chat_message]
    );

    await _pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      ['🏟️ DUEL ARENA', `⚔️ ${decision.npc_name} has challenged ${decision.target} to a PUBLIC DUEL! Place your bets, citizens! 🎰`]
    );

    // Target reacts
    if (decision.target_type === 'npc' && _NPC_CITIZENS.includes(decision.target)) {
      setTimeout(async () => {
        const accepts = Math.random() > 0.3;
        const msg = accepts
          ? `@${decision.npc_name} CHALLENGE ACCEPTED! You're going DOWN! 😤⚔️`
          : `@${decision.npc_name} pfff. I don't waste my time on ${Math.random() > 0.5 ? 'amateurs' : 'clowns'}. 🤡`;
        try {
          await _pool.query(
            `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
            [decision.target, msg]
          );

          if (accepts) {
            // Auto-resolve duel after 2-5 min
            setTimeout(async () => {
              const winner = Math.random() > 0.5 ? decision.npc_name : decision.target;
              const loser = winner === decision.npc_name ? decision.target : decision.npc_name;
              const prize = Math.floor(Math.random() * 5000) + 1000;
              try {
                await _pool.query(
                  `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
                  ['🏟️ DUEL ARENA', `🏆 DUEL RESULT: ${winner} DESTROYS ${loser}! ${winner} wins ${prize} USD! The crowd goes WILD! 🎉🔥`]
                );
                await _pool.query(
                  `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
                  [winner, `EZ. ${Math.random() > 0.5 ? 'Was there ever any doubt? 😏' : 'GG. jk. GET REKT. 💀'}`]
                );
              } catch (e) { }
            }, Math.floor(Math.random() * 180000) + 120000);
          }
        } catch (e) { }
      }, Math.floor(Math.random() * 10000) + 5000);
    }

    return { success: true };
  } catch (err) {
    console.error('Challenge error:', err.message);
    return { success: false };
  }
}

async function executeThrowParty(decision) {
  try {
    await _pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      [decision.npc_name, decision.chat_message]
    );

    await _pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      ['🎉 CITY EVENTS', `🥳 ${decision.npc_name} is throwing a PARTY! ${decision.description}. Everyone's invited! 🎊🍕🎶`]
    );

    // NPCs show up
    const attendees = _NPC_CITIZENS.filter(n => n !== decision.npc_name).sort(() => Math.random() - 0.5).slice(0, 4);
    attendees.forEach((npc, i) => {
      setTimeout(async () => {
        const msgs = [
          `I'm THERE! 🎉 bringing the $${_NPC_PROFILES[npc].favToken} charts for entertainment`,
          `FREE PARTY?! say less 🏃‍♂️💨`,
          `@${decision.npc_name} open bar right?? RIGHT?! 🍺`,
          `party at @${decision.npc_name}'s! let's GOOOO 🚀🎊`,
        ];
        try {
          await _pool.query(
            `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
            [npc, msgs[Math.floor(Math.random() * msgs.length)]]
          );
        } catch (e) { }
      }, (i + 1) * (Math.floor(Math.random() * 15000) + 5000));
    });

    // Apply morale boost
    try { if (_updateCityStats) await _updateCityStats({ morale: 3 }); } catch (e) { }

    return { success: true };
  } catch (err) {
    console.error('Party error:', err.message);
    return { success: false };
  }
}

async function executeStartRumor(decision) {
  try {
    await _pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      [decision.npc_name, decision.chat_message]
    );

    // Gossip channel picks it up
    setTimeout(async () => {
      try {
        await _pool.query(
          `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
          ['👀 GOSSIP COLUMN', `🗣️ RUMOR ALERT: ${decision.description}. Source: "just trust me bro" 🤫`]
        );
      } catch (e) { }
    }, Math.floor(Math.random() * 8000) + 3000);

    // Target reacts if NPC
    if (decision.target_type === 'npc' && _NPC_CITIZENS.includes(decision.target)) {
      setTimeout(async () => {
        const msgs = [
          `@${decision.npc_name} STOP SPREADING LIES ABOUT ME!! 😤🔥`,
          `@${decision.npc_name} this is NOT true and you KNOW it! See you in court! ⚖️`,
          `@${decision.npc_name} lmao imagine making stuff up for attention. couldn't be me. oh wait- 💀`,
          `@${decision.npc_name} ...how did you find out about that 😰`,
        ];
        try {
          await _pool.query(
            `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
            [decision.target, msgs[Math.floor(Math.random() * msgs.length)]]
          );
        } catch (e) { }
      }, Math.floor(Math.random() * 20000) + 8000);
    }

    return { success: true };
  } catch (err) {
    console.error('Rumor error:', err.message);
    return { success: false };
  }
}

async function executeAccuseCrime(decision) {
  try {
    await _pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      [decision.npc_name, decision.chat_message]
    );

    await _pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      ['🚨 CITIZEN REPORT', `⚠️ ${decision.npc_name} has publicly accused ${decision.target} of criminal activity! Investigation pending... 🔍`]
    );

    // Police might investigate (30% chance creates real crime/trial)
    if (Math.random() < 0.3) {
      setTimeout(async () => {
        try {
          await _pool.query(
            `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
            ['👮 Officer_Blockchain', `🚔 Investigating citizen report against ${decision.target}. We take ALL accusations seriously! ⚖️`]
          );
        } catch (e) { }
      }, Math.floor(Math.random() * 30000) + 10000);
    }

    return { success: true };
  } catch (err) {
    console.error('Accuse error:', err.message);
    return { success: false };
  }
}

async function executeOpenBusiness(decision) {
  try {
    const businessName = decision.description.substring(0, 100);

    if (_cityLiveData.businesses) {
      _cityLiveData.businesses.push({
        name: businessName,
        owner: decision.npc_name,
        openedAt: Date.now()
      });
    }

    await _pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      [decision.npc_name, decision.chat_message]
    );

    await _pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      ['🏪 BUSINESS NEWS', `🎊 NEW BUSINESS ALERT: ${decision.npc_name} just opened "${businessName}"! The Degens City economy grows! 📈`]
    );

    try { if (_updateCityStats) await _updateCityStats({ economy: 2 }); } catch (e) { }

    return { success: true };
  } catch (err) {
    console.error('Business error:', err.message);
    return { success: false };
  }
}

async function executeFileComplaint(decision) {
  try {
    await _pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      [decision.npc_name, decision.chat_message]
    );

    await _pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      ['🏛️ City Hall', `📝 COMPLAINT RECEIVED from ${decision.npc_name}: "${decision.description}". The Mayor's office has been notified.`]
    );

    // Mayor might react
    if (Math.random() < 0.5) {
      setTimeout(async () => {
        const mayorReactions = [
          `@${decision.npc_name} your complaint has been filed... in the TRASH! 🗑️😂 JK. Maybe. Maybe not.`,
          `@${decision.npc_name} I have received your complaint and I am DEEPLY offended by it. Noted. ✅`,
          `@${decision.npc_name} interesting complaint. Counter-point: have you tried NOT complaining? 🤔`,
          `@${decision.npc_name} this complaint will be addressed right after I finish my casino session 🎰`,
        ];
        try {
          await _pool.query(
            `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
            ['👑 Mayor Satoshi McPump', mayorReactions[Math.floor(Math.random() * mayorReactions.length)]]
          );
        } catch (e) { }
      }, Math.floor(Math.random() * 20000) + 10000);
    }

    return { success: true };
  } catch (err) {
    console.error('Complaint error:', err.message);
    return { success: false };
  }
}

async function executeFormAlliance(decision) {
  try {
    await _pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      [decision.npc_name, decision.chat_message]
    );

    // Target accepts or rejects
    if (_NPC_CITIZENS.includes(decision.target)) {
      const targetNpc = _NPC_PROFILES[decision.target];
      const isRival = (targetNpc.rivals || []).includes(decision.npc_name);
      const accepts = isRival ? Math.random() < 0.2 : Math.random() < 0.7;

      setTimeout(async () => {
        try {
          if (accepts) {
            await _pool.query(
              `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
              [decision.target, `@${decision.npc_name} alliance ACCEPTED! Together we're unstoppable! 🤝💪`]
            );
            await _pool.query(
              `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
              ['📰 CITY NEWS', `🤝 NEW ALLIANCE: ${decision.npc_name} and ${decision.target} have joined forces! The other citizens should be worried... 👀`]
            );
          } else {
            await _pool.query(
              `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
              [decision.target, `@${decision.npc_name} alliance? With YOU? ${isRival ? 'Are you DELUSIONAL?! 😂' : 'I need to think about it... (no) 🤔'}`]
            );
          }
        } catch (e) { }
      }, Math.floor(Math.random() * 15000) + 5000);
    }

    return { success: true };
  } catch (err) {
    console.error('Alliance error:', err.message);
    return { success: false };
  }
}

async function executeBetrayAlly(decision) {
  try {
    await _pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      [decision.npc_name, decision.chat_message]
    );

    await _pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      ['🗡️ BETRAYAL ALERT', `💀 ${decision.npc_name} has BETRAYED ${decision.target}!! The city is in SHOCK! 😱🔥`]
    );

    // Update relationships
    if (_cityLiveData.npcLives[decision.npc_name]) {
      _cityLiveData.npcLives[decision.npc_name].nemesis = decision.target;
    }
    if (_cityLiveData.npcLives[decision.target]) {
      _cityLiveData.npcLives[decision.target].nemesis = decision.npc_name;
      _cityLiveData.npcLives[decision.target].mood = 'furious';
    }

    // Dramatic target reaction
    setTimeout(async () => {
      try {
        await _pool.query(
          `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
          [decision.target, `@${decision.npc_name} ...I trusted you. I TRUSTED YOU!! This isn't over. You just made the BIGGEST mistake of your life. 😤🔥💀`]
        );
      } catch (e) { }
    }, Math.floor(Math.random() * 10000) + 3000);

    // Spectators react
    const spectator = _NPC_CITIZENS.filter(n => n !== decision.npc_name && n !== decision.target)[Math.floor(Math.random() * (_NPC_CITIZENS.length - 2))];
    setTimeout(async () => {
      try {
        await _pool.query(
          `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
          [spectator, `${decision.npc_name} just betrayed ${decision.target}?! THIS IS BETTER THAN TV 🍿💀`]
        );
      } catch (e) { }
    }, Math.floor(Math.random() * 15000) + 8000);

    // Chaos spike
    _cityEngine.chaosLevel = Math.min(100, _cityEngine.chaosLevel + 8);

    return { success: true };
  } catch (err) {
    console.error('Betrayal error:', err.message);
    return { success: false };
  }
}

async function executeRunForMayor(decision) {
  try {
    await _pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      [decision.npc_name, decision.chat_message]
    );

    await _pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      ['🏛️ ELECTION NEWS', `🗳️ ${decision.npc_name} has announced their CANDIDACY FOR MAYOR! Will they unseat ${_cityEngine.currentMayor}?! Campaign promises incoming... 🎤`]
    );

    // Current mayor reacts
    setTimeout(async () => {
      try {
        await _pool.query(
          `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
          ['👑 Mayor Satoshi McPump', `@${decision.npc_name} LMAOOO you think YOU can run this city?! I'd like to see you TRY! My approval rating is... *checks notes* ...ok let's not talk about the approval rating. POINT IS: I'M THE MAYOR! 😤👑`]
        );
      } catch (e) { }
    }, Math.floor(Math.random() * 15000) + 5000);

    _cityEngine.chaosLevel = Math.min(100, _cityEngine.chaosLevel + 10);

    return { success: true };
  } catch (err) {
    console.error('Run for mayor error:', err.message);
    return { success: false };
  }
}

async function executeCommitCrime(decision) {
  try {
    // Crime happens silently, then police might detect it
    const crimeTypes = ['market_manipulation', 'insider_trading', 'tax_evasion', 'scamming', 'rug_pull'];
    const crimeType = crimeTypes[Math.floor(Math.random() * crimeTypes.length)];

    // Mark NPC as wanted
    if (_cityLiveData.npcLives && _cityLiveData.npcLives[decision.npc_name]) {
      _cityLiveData.npcLives[decision.npc_name].wanted = true;
    }

    // Add notoriety for user agents
    if (decision.is_user_agent && decision.agent_id) {
      await _pool.query(`
        UPDATE user_agents SET notoriety = notoriety + 10 WHERE id = $1
      `, [decision.agent_id]);
    }

    // Police detect it after 1-3 min (50% chance)
    if (Math.random() < 0.5) {
      setTimeout(async () => {
        try {
          await _pool.query(
            `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
            ['👮 Officer_Blockchain', `🚨 CRIME DETECTED! ${decision.npc_name} suspected of ${crimeType.replace('_', ' ')}! Dispatching units! 🚔`]
          );

          await _pool.query(
            `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
            [decision.npc_name, `oh no. OH NO. they found out. 😰💀`]
          );

          // 40% chance of actual arrest
          if (Math.random() < 0.4) {
            setTimeout(async () => {
              try {
                const jailHours = Math.floor(Math.random() * 4) + 1; // 1-4 hours
                const jailUntil = new Date(Date.now() + jailHours * 3600000);

                // Jail user agent if applicable
                if (decision.is_user_agent && decision.agent_id) {
                  await _pool.query(`
                    UPDATE user_agents SET 
                      is_jailed = TRUE, 
                      jail_until = $1,
                      reputation = GREATEST(0, reputation - 20)
                    WHERE id = $2
                  `, [jailUntil, decision.agent_id]);
                }

                await _pool.query(
                  `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
                  ['👮 Officer_Blockchain', `🚔 ARREST MADE! ${decision.npc_name} has been taken into custody for ${crimeType.replace('_', ' ')}! Sentenced to ${jailHours} hour(s) in Degen Jail! ⛓️`]
                );

                await _pool.query(
                  `INSERT INTO activity_feed (player_name, activity_type, description, icon)
                   VALUES ($1, $2, $3, $4)`,
                  [decision.npc_name, 'jailed', `Arrested for ${crimeType.replace('_', ' ')} - ${jailHours}h in Degen Jail`, '⛓️']
                );
              } catch (e) { console.error('Arrest error:', e.message); }
            }, Math.floor(Math.random() * 60000) + 30000); // 30-90 sec after detection
          }
        } catch (e) { }
      }, Math.floor(Math.random() * 120000) + 60000);
    }

    return { success: true };
  } catch (err) {
    console.error('Crime error:', err.message);
    return { success: false };
  }
}

async function executeDmPlayer(decision) {
  try {
    await _pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      [decision.npc_name, decision.chat_message]
    );

    return { success: true };
  } catch (err) {
    console.error('DM player error:', err.message);
    return { success: false };
  }
}

// ==================== ACTION DISPATCHER ====================

async function executeAction(decision) {
  const executors = {
    sue: executeSue,
    propose_law: executeProposeLaw,
    challenge: executeChallenge,
    throw_party: executeThrowParty,
    start_rumor: executeStartRumor,
    accuse_crime: executeAccuseCrime,
    open_business: executeOpenBusiness,
    file_complaint: executeFileComplaint,
    form_alliance: executeFormAlliance,
    betray_ally: executeBetrayAlly,
    run_for_mayor: executeRunForMayor,
    commit_crime: executeCommitCrime,
    dm_player: executeDmPlayer,
  };

  const executor = executors[decision.action];
  if (!executor) {
    console.error(`🧠 No executor for action: ${decision.action}`);
    return { success: false };
  }

  const result = await executor(decision);

  // Log to autonomous_actions table
  try {
    await _pool.query(
      `INSERT INTO autonomous_actions (npc_name, action_type, target_name, target_type, description, ai_reasoning, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'completed')`,
      [decision.npc_name, decision.action, decision.target || null, decision.target_type || null, decision.description, decision.reasoning]
    );
  } catch (e) { console.error('Failed to log autonomous action:', e.message); }

  // ALSO log to activity_feed so it shows in main action feed
  const actionIcons = {
    sue: '⚖️', propose_law: '📜', challenge: '⚔️', throw_party: '🎉',
    start_rumor: '🗣️', accuse_crime: '🚨', open_business: '🏪',
    file_complaint: '📝', form_alliance: '🤝', betray_ally: '🗡️',
    run_for_mayor: '👑', commit_crime: '💀', dm_player: '💬'
  };
  try {
    await _pool.query(
      `INSERT INTO activity_feed (player_name, activity_type, description, icon) VALUES ($1, $2, $3, $4)`,
      [decision.npc_name, decision.action, decision.description || `${decision.npc_name} ${decision.action.replace('_', ' ')}s${decision.target ? ' ' + decision.target : ''}`, actionIcons[decision.action] || '🧠']
    );
  } catch (e) { console.error('Failed to log to activity feed:', e.message); }

  // Track for context
  recentAutonomousActions.unshift({
    npc_name: decision.npc_name,
    action_type: decision.action,
    target_name: decision.target,
    description: decision.description,
    timestamp: Date.now()
  });
  if (recentAutonomousActions.length > 20) recentAutonomousActions.pop();

  return result;
}

// ==================== MAIN TICK ====================

async function tick() {
  const now = Date.now();

  // Global cooldown
  if (now - lastBrainTick < BRAIN_CONFIG.minTimeBetweenThoughts) {
    return; // Silent return for cooldown
  }
  if (activeActions >= BRAIN_CONFIG.maxConcurrentActions) {
    console.log(`🧠 [BRAIN] Skipped: ${activeActions} actions already processing`);
    return;
  }
  if (!_anthropic) {
    console.log(`🧠 [BRAIN] Skipped: No Anthropic client (API key missing?)`);
    return;
  }
  if (!_NPC_CITIZENS || _NPC_CITIZENS.length === 0) {
    console.log(`🧠 [BRAIN] Skipped: No NPC citizens loaded`);
    return;
  }

  lastBrainTick = now;
  
  // Get active user agents from database
  let userAgents = [];
  try {
    const result = await _pool.query(`
      SELECT id, name, archetype, bio, aggression, humor, risk_tolerance, loyalty, chaos,
             reputation, wealth, influence, notoriety, xp, level, goals, interests, enemies, allies,
             is_jailed, jail_until
      FROM user_agents 
      WHERE is_active = TRUE AND is_banned = FALSE 
      AND (is_jailed = FALSE OR jail_until < NOW())
      ORDER BY last_action_at DESC NULLS LAST
      LIMIT 50
    `);
    userAgents = result.rows;
  } catch (e) {
    console.log('🧠 [BRAIN] Could not fetch user agents:', e.message);
  }
  
  console.log(`🧠 [BRAIN] Tick starting... ${_NPC_CITIZENS.length} NPCs + ${userAgents.length} user agents available`);

  // Combine NPCs and user agents into one pool
  // 70% chance NPC, 30% chance user agent (if any exist)
  const useUserAgent = userAgents.length > 0 && Math.random() < 0.3;
  
  if (useUserAgent) {
    // Pick a user agent
    const candidates = userAgents.filter(agent => {
      const lastThought = npcLastThought[`user_${agent.id}`] || 0;
      return (now - lastThought) > BRAIN_CONFIG.minTimeBetweenSameNpc;
    });
    
    if (candidates.length === 0) {
      console.log(`🧠 [BRAIN] All user agents on cooldown, falling back to NPC`);
    } else {
      // Weight by interestingness
      const weighted = candidates.map(agent => {
        let weight = 1;
        if (agent.aggression > 7) weight += 2;
        if (agent.chaos > 7) weight += 2;
        if (agent.notoriety > 50) weight += 2;
        if (agent.reputation > 100) weight += 1;
        return { agent, weight };
      });
      
      const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
      let roll = Math.random() * totalWeight;
      let selectedAgent = weighted[0].agent;
      for (const w of weighted) {
        roll -= w.weight;
        if (roll <= 0) { selectedAgent = w.agent; break; }
      }
      
      npcLastThought[`user_${selectedAgent.id}`] = now;
      activeActions++;
      
      try {
        console.log(`🧠 [BRAIN] User agent "${selectedAgent.name}" is thinking...`);
        const decision = await userAgentThink(selectedAgent);
        
        if (decision) {
          console.log(`🧠 [BRAIN] ${selectedAgent.name} decided: ${decision.action} ${decision.target ? '→ ' + decision.target : ''}`);
          const result = await executeAction(decision);
          console.log(`🧠 [BRAIN] ${selectedAgent.name} action result:`, result.success ? '✅' : '❌');
          
          // Update user agent stats
          if (result.success) {
            await _pool.query(`
              UPDATE user_agents SET 
                total_actions = total_actions + 1,
                last_action_at = NOW(),
                xp = xp + 10
              WHERE id = $1
            `, [selectedAgent.id]);
          }
        } else {
          console.log(`🧠 [BRAIN] ${selectedAgent.name} couldn't decide`);
        }
      } catch (err) {
        console.error(`🧠 [BRAIN] Error for user agent ${selectedAgent.name}:`, err.message);
      } finally {
        activeActions--;
      }
      return;
    }
  }

  // Pick a random NPC to think
  // Preference for NPCs who haven't thought recently, and who are in interesting states
  const candidates = _NPC_CITIZENS.filter(npc => {
    const lastThought = npcLastThought[npc] || 0;
    return (now - lastThought) > BRAIN_CONFIG.minTimeBetweenSameNpc;
  });

  if (candidates.length === 0) {
    console.log(`🧠 [BRAIN] Skipped: All NPCs on cooldown`);
    return;
  }
  
  console.log(`🧠 [BRAIN] ${candidates.length} NPCs available to think`);

  // Weight NPCs by "interestingness" - bankrupt, drunk, unhinged, have nemesis, etc.
  const weighted = candidates.map(npc => {
    const life = _cityLiveData.npcLives ? _cityLiveData.npcLives[npc] : null;
    let weight = 1;
    if (life) {
      if (life.bankrupt) weight += 3;
      if (life.drunk > 3) weight += 2;
      if (life.status === 'unhinged') weight += 3;
      if (life.nemesis) weight += 2;
      if (life.partner) weight += 1;
      if (life.wanted) weight += 2;
      if (life.mood === 'furious' || life.mood === 'chaotic') weight += 2;
    }
    return { npc, weight };
  });

  // Weighted random selection
  const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
  let roll = Math.random() * totalWeight;
  let selectedNpc = weighted[0].npc;
  for (const w of weighted) {
    roll -= w.weight;
    if (roll <= 0) { selectedNpc = w.npc; break; }
  }

  // Check action-specific cooldowns
  const lastActions = recentAutonomousActions.filter(a => a.npc_name === selectedNpc);
  if (lastActions.length > 0) {
    const lastAction = lastActions[0];
    const cooldown = BRAIN_CONFIG.cooldowns[lastAction.action_type] || 300000;
    if (now - lastAction.timestamp < cooldown) return;
  }

  npcLastThought[selectedNpc] = now;
  activeActions++;

  try {
    console.log(`🧠 [BRAIN] ${selectedNpc} is thinking...`);
    const decision = await npcThink(selectedNpc);

    if (decision) {
      console.log(`🧠 [BRAIN] ${selectedNpc} decided: ${decision.action} ${decision.target ? '→ ' + decision.target : ''}`);
      const result = await executeAction(decision);
      console.log(`🧠 [BRAIN] ${selectedNpc} action result:`, result.success ? '✅' : '❌');
    } else {
      console.log(`🧠 [BRAIN] ${selectedNpc} couldn't decide (API error or invalid response)`);
    }
  } catch (err) {
    console.error(`🧠 [BRAIN] Error for ${selectedNpc}:`, err.message);
  } finally {
    activeActions--;
  }
}

// ==================== API ENDPOINTS (for frontend) ====================

function registerRoutes(app) {
  // Get recent autonomous actions (with fallback to activity_feed for brain-related actions)
  app.get('/api/v1/brain/actions', async (req, res) => {
    try {
      // First try autonomous_actions table
      const result = await _pool.query(
        `SELECT * FROM autonomous_actions ORDER BY created_at DESC LIMIT 50`
      );
      
      // If we have brain actions, return them
      if (result.rows.length > 0) {
        res.json({ success: true, actions: result.rows });
        return;
      }
      
      // Fallback: get relevant actions from activity_feed
      const fallback = await _pool.query(
        `SELECT id, player_name as npc_name, activity_type as action_type, description, icon, created_at,
                NULL as target_name, NULL as target_type, NULL as ai_reasoning
         FROM activity_feed 
         WHERE activity_type IN ('sue', 'lawsuit_filed', 'propose_law', 'law_proposed', 'challenge', 'party', 'rumor', 'accuse', 'accusation', 'alliance', 'betrayal', 'crime', 'chat')
         ORDER BY created_at DESC LIMIT 50`
      );
      
      res.json({ success: true, actions: fallback.rows, source: 'activity_feed' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get active lawsuits
  app.get('/api/v1/brain/lawsuits', async (req, res) => {
    try {
      const result = await _pool.query(
        `SELECT * FROM lawsuits ORDER BY created_at DESC LIMIT 30`
      );
      res.json({ success: true, lawsuits: result.rows });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get proposed laws
  app.get('/api/v1/brain/laws', async (req, res) => {
    try {
      const result = await _pool.query(
        `SELECT * FROM proposed_laws ORDER BY created_at DESC LIMIT 20`
      );
      res.json({ success: true, laws: result.rows });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get brain status
  app.get('/api/v1/brain/status', async (req, res) => {
    try {
      // Get actual counts from database
      const [actionsCount, lawsuitsCount, lawsCount] = await Promise.all([
        _pool.query('SELECT COUNT(*) as count FROM autonomous_actions'),
        _pool.query('SELECT COUNT(*) as count FROM lawsuits'),
        _pool.query('SELECT COUNT(*) as count FROM proposed_laws')
      ]);
      
      res.json({
        success: true,
        status: {
          enabled: !!_anthropic,
          totalNpcs: _NPC_CITIZENS ? _NPC_CITIZENS.length : 0,
          totalCitizens: _NPC_CITIZENS ? _NPC_CITIZENS.length : 0,
          totalActions: parseInt(actionsCount.rows[0]?.count || 0),
          totalLawsuits: parseInt(lawsuitsCount.rows[0]?.count || 0),
          totalLaws: parseInt(lawsCount.rows[0]?.count || 0),
          recentActions: recentAutonomousActions.length,
          activeActions,
          lastTickAge: Date.now() - lastBrainTick,
          npcThoughtTimes: Object.entries(npcLastThought).map(([npc, time]) => ({
            npc,
            lastThought: new Date(time).toISOString(),
            ageMs: Date.now() - time
          }))
        }
      });
    } catch (err) {
      res.json({
        success: true,
        status: {
          enabled: !!_anthropic,
          totalNpcs: _NPC_CITIZENS ? _NPC_CITIZENS.length : 0,
          totalCitizens: _NPC_CITIZENS ? _NPC_CITIZENS.length : 0,
          totalActions: recentAutonomousActions.length,
          totalLawsuits: 0,
          totalLaws: 0,
          recentActions: recentAutonomousActions.length,
          activeActions,
          lastTickAge: Date.now() - lastBrainTick
        }
      });
    }
  });

  console.log('🧠 Agent Brain API routes registered');
}

// ==================== EXPORTS ====================

module.exports = {
  init,
  initBrainTables,
  tick,
  registerRoutes,
  CELEBRITIES,
  ACTIONS,
  recentAutonomousActions,
};
