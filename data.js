// Everything the game teaches: words, phrases, villagers, shop.
// The voice script (tools/voice.mjs) reads this same file, so text and audio can't drift apart.
//
// Word fields: id, uk (Ukrainian), tr (how to say it, stressed syllable in CAPS), en,
// ic (an emoji, or "@name" for a hand-drawn icon), acc (the "bring me ..." form, when it changes).
window.DATA = {
  words: [
    // --- around the village
    { id: "khata", uk: "хата", tr: "KHA-ta", en: "cottage", ic: "@khata", acc: "хату" },
    { id: "parkan", uk: "паркан", tr: "par-KAN", en: "fence", ic: "@parkan" },
    { id: "krynytsia", uk: "криниця", tr: "kry-NY-tsia", en: "well", ic: "@well", acc: "криницю" },
    { id: "derevo", uk: "дерево", tr: "DE-re-vo", en: "tree", ic: "🌳" },
    { id: "yablunia", uk: "яблуня", tr: "YA-blu-nia", en: "apple tree", ic: "@appletree", acc: "яблуню" },
    { id: "kushch", uk: "кущ", tr: "kushch", en: "bush", ic: "@bush" },
    { id: "kamin", uk: "камінь", tr: "KA-min", en: "stone", ic: "@stone" },
    { id: "kvitka", uk: "квітка", tr: "KVIT-ka", en: "flower", ic: "🌷", acc: "квітку" },
    { id: "soniashnyk", uk: "соняшник", tr: "SO-niash-nyk", en: "sunflower", ic: "🌻", fact: { uk: "Україна вирощує дуже багато соняшників.", en: "Ukraine is one of the world's biggest sunflower growers." } },
    { id: "hryb", uk: "гриб", tr: "hryb", en: "mushroom", ic: "🍄" },
    { id: "stavok", uk: "ставок", tr: "sta-VOK", en: "pond", ic: "@pond" },
    { id: "choven", uk: "човен", tr: "CHO-ven", en: "boat", ic: "@canoe" },
    { id: "tserkva", uk: "церква", tr: "TSERK-va", en: "church", ic: "@church", acc: "церкву" },
    { id: "mlyn", uk: "млин", tr: "mlyn", en: "windmill", ic: "@mill" },
    { id: "lavka", uk: "лавка", tr: "LAV-ka", en: "bench", ic: "@bench", acc: "лавку" },
    { id: "leleka", uk: "лелека", tr: "le-LE-ka", en: "stork", ic: "@stork", acc: "лелеку", fact: { uk: "Лелека на даху приносить щастя.", en: "A stork nesting on the roof is said to bring good luck." } },
    { id: "vulyk", uk: "вулик", tr: "VU-lyk", en: "beehive", ic: "@hive" },
    { id: "rynok", uk: "ринок", tr: "RY-nok", en: "market", ic: "@stall" },
    { id: "horod", uk: "город", tr: "ho-ROD", en: "vegetable garden", ic: "@plot" },
    // --- animals
    { id: "kit", uk: "кіт", tr: "kit", en: "cat", ic: "🐈" },
    { id: "sobaka", uk: "собака", tr: "so-BA-ka", en: "dog", ic: "🐕" },
    { id: "kurka", uk: "курка", tr: "KUR-ka", en: "hen", ic: "🐔" },
    { id: "piven", uk: "півень", tr: "PI-ven", en: "rooster", ic: "🐓" },
    { id: "korova", uk: "корова", tr: "ko-RO-va", en: "cow", ic: "🐄" },
    { id: "kin", uk: "кінь", tr: "kin", en: "horse", ic: "🐎" },
    { id: "koza", uk: "коза", tr: "ko-ZA", en: "goat", ic: "🐐" },
    { id: "kachka", uk: "качка", tr: "KACH-ka", en: "duck", ic: "🦆" },
    { id: "svynia", uk: "свиня", tr: "svy-NIA", en: "pig", ic: "🐖" },
    { id: "bdzhola", uk: "бджола", tr: "bdzho-LA", en: "bee", ic: "🐝" },
    { id: "metelyk", uk: "метелик", tr: "me-TE-lyk", en: "butterfly", ic: "🦋" },
    { id: "zhaba", uk: "жаба", tr: "ZHA-ba", en: "frog", ic: "@frog" },
    { id: "ryba", uk: "риба", tr: "RY-ba", en: "fish", ic: "🐟", acc: "рибу" },
    // --- the cats of the valley (colour words; "кішка" is a female cat)
    { id: "rudyi_kit", uk: "рудий кіт", tr: "ru-DYI kit", en: "ginger cat", ic: "@cat_rudyi" },
    { id: "chornyi_kit", uk: "чорний кіт", tr: "CHOR-nyi kit", en: "black cat", ic: "@cat_chornyi" },
    { id: "bilyi_kit", uk: "білий кіт", tr: "BI-lyi kit", en: "white cat", ic: "@cat_bilyi" },
    { id: "siryi_kit", uk: "сірий кіт", tr: "SI-ryi kit", en: "grey cat", ic: "@cat_siryi" },
    { id: "smuhastyi_kit", uk: "смугастий кіт", tr: "smu-HAS-tyi kit", en: "striped cat", ic: "@cat_smuhastyi" },
    { id: "trykolirna_kishka", uk: "триколірна кішка", tr: "try-ko-LIR-na KISH-ka", en: "calico cat", ic: "@cat_trykolirna" },
    // --- food
    { id: "khlib", uk: "хліб", tr: "khlib", en: "bread", ic: "🍞" },
    { id: "moloko", uk: "молоко", tr: "mo-lo-KO", en: "milk", ic: "🥛" },
    { id: "syr", uk: "сир", tr: "syr", en: "cheese", ic: "🧀" },
    { id: "yaitse", uk: "яйце", tr: "yai-TSE", en: "egg", ic: "🥚" },
    { id: "med", uk: "мед", tr: "med", en: "honey", ic: "🍯" },
    { id: "maslo", uk: "масло", tr: "MAS-lo", en: "butter", ic: "🧈" },
    { id: "yabluko", uk: "яблуко", tr: "YA-blu-ko", en: "apple", ic: "🍎" },
    { id: "hrusha", uk: "груша", tr: "HRU-sha", en: "pear", ic: "🍐", acc: "грушу" },
    { id: "vyshnia", uk: "вишня", tr: "VYSH-nia", en: "cherry", ic: "🍒", acc: "вишню" },
    { id: "polunytsia", uk: "полуниця", tr: "po-lu-NY-tsia", en: "strawberry", ic: "🍓", acc: "полуницю" },
    { id: "kavun", uk: "кавун", tr: "ka-VUN", en: "watermelon", ic: "🍉" },
    { id: "kartoplia", uk: "картопля", tr: "kar-TOP-lia", en: "potato", ic: "🥔", acc: "картоплю" },
    { id: "morkva", uk: "морква", tr: "MORK-va", en: "carrot", ic: "🥕", acc: "моркву" },
    { id: "buriak", uk: "буряк", tr: "bu-RIAK", en: "beetroot", ic: "@beet" },
    { id: "boroshno", uk: "борошно", tr: "BO-rosh-no", en: "flour", ic: "@flour" },
    { id: "kapusta", uk: "капуста", tr: "ka-PUS-ta", en: "cabbage", ic: "🥬", acc: "капусту" },
    { id: "tsybulia", uk: "цибуля", tr: "tsy-BU-lia", en: "onion", ic: "🧅", acc: "цибулю" },
    { id: "chasnyk", uk: "часник", tr: "chas-NYK", en: "garlic", ic: "🧄" },
    { id: "pomidor", uk: "помідор", tr: "po-mi-DOR", en: "tomato", ic: "🍅" },
    { id: "ohirok", uk: "огірок", tr: "o-hi-ROK", en: "cucumber", ic: "🥒" },
    { id: "harbuz", uk: "гарбуз", tr: "har-BUZ", en: "pumpkin", ic: "@pumpkin" },
    { id: "kukurudza", uk: "кукурудза", tr: "ku-ku-RU-dza", en: "corn", ic: "🌽", acc: "кукурудзу" },
    { id: "borshch", uk: "борщ", tr: "borshch", en: "borscht", ic: "@borshch", fact: { uk: "Борщ варять у кожній українській родині.", en: "Ukrainian borscht cooking was added to UNESCO's heritage list in 2022." } },
    { id: "varenyky", uk: "вареники", tr: "va-RE-ny-ky", en: "varenyky (dumplings)", ic: "@varenyky", fact: { uk: "Вареники ліплять із тіста.", en: "Varenyky are dumplings filled with potato, cheese or cherries." } },
    { id: "deruny", uk: "деруни", tr: "de-RU-ny", en: "potato pancakes (deruny)", ic: "@deruny", fact: { uk: "Деруни смажать із картоплі.", en: "Deruny are crispy fried potato pancakes, often eaten with sour cream." } },
    { id: "holubtsi", uk: "голубці", tr: "ho-lub-TSI", en: "cabbage rolls (holubtsi)", ic: "@holubtsi", fact: { uk: "Голубці роблять із капусти.", en: "Holubtsi are cabbage leaves rolled around rice and filling, then simmered in tomato sauce." } },
    { id: "syrnyky", uk: "сирники", tr: "SYR-ny-ky", en: "cheese pancakes (syrnyky)", ic: "@syrnyky", fact: { uk: "Сирники роблять із сиру.", en: "Syrnyky are small fried cottage-cheese pancakes, often served with sour cream or jam." } },
    { id: "rys", uk: "рис", tr: "rys", en: "rice", ic: "🍚" },
    { id: "pyrih", uk: "пиріг", tr: "py-RIH", en: "pie", ic: "🥧" },
    { id: "chai", uk: "чай", tr: "chai", en: "tea", ic: "🍵" },
    { id: "voda", uk: "вода", tr: "vo-DA", en: "water", ic: "💧", acc: "воду" },
    { id: "sil", uk: "сіль", tr: "sil", en: "salt", ic: "🧂" },
    // --- for the cottage
    { id: "stil", uk: "стіл", tr: "stil", en: "table", ic: "@table" },
    { id: "stilets", uk: "стілець", tr: "sti-LETS", en: "chair", ic: "🪑" },
    { id: "lizhko", uk: "ліжко", tr: "LIZH-ko", en: "bed", ic: "@ukbed" },
    { id: "lampa", uk: "лампа", tr: "LAM-pa", en: "lamp", ic: "@floorlamp", acc: "лампу" },
    { id: "kylym", uk: "килим", tr: "KY-lym", en: "rug", ic: "@rug" },
    { id: "kartyna", uk: "картина", tr: "kar-TY-na", en: "painting", ic: "🖼️", acc: "картину" },
    { id: "vazon", uk: "вазон", tr: "va-ZON", en: "potted plant", ic: "🪴" },
    { id: "knyha", uk: "книга", tr: "KNY-ha", en: "book", ic: "@books", acc: "книгу" },
    { id: "svichka", uk: "свічка", tr: "SVICH-ka", en: "candle", ic: "🕯️", acc: "свічку" },
    { id: "hlechyk", uk: "глечик", tr: "HLE-chyk", en: "clay jug", ic: "🏺", fact: { uk: "Глечики сушили на тину.", en: "Clay jugs were hung upside down on village fences to dry." } },
    { id: "dzerkalo", uk: "дзеркало", tr: "DZER-ka-lo", en: "mirror", ic: "🪞" },
    { id: "hodynnyk", uk: "годинник", tr: "ho-DYN-nyk", en: "clock", ic: "🕰️" },
    { id: "pich", uk: "піч", tr: "pich", en: "stove", ic: "@stove" },
    { id: "rushnyk", uk: "рушник", tr: "rush-NYK", en: "embroidered towel", ic: "@rushnyk", fact: { uk: "Хліб і сіль зустрічають гостей на рушнику.", en: "Guests are welcomed with bread and salt held on an embroidered towel." } },
    { id: "chashka", uk: "чашка", tr: "CHASH-ka", en: "cup", ic: "☕", acc: "чашку" },
    { id: "kvity", uk: "квіти", tr: "KVI-ty", en: "flowers", ic: "💐" },
    { id: "polytsia", uk: "полиця", tr: "po-LY-tsia", en: "shelf", ic: "@shelf", acc: "полицю" },
    // --- Ukrainian culture
    { id: "pysanka", uk: "писанка", tr: "py-SAN-ka", en: "painted Easter egg", ic: "@pysanka", acc: "писанку", fact: { uk: "Писанки малюють воском і фарбами на Великдень.", en: "Pysanky are eggs painted with wax and dyes at Easter. Every pattern has a meaning." } },
    { id: "kalyna", uk: "калина", tr: "ka-LY-na", en: "viburnum (red berries)", ic: "@kalyna", acc: "калину", fact: { uk: "Калина — символ України. Про неї співають у піснях.", en: "Kalyna, the red viburnum, is a symbol of Ukraine. It appears in songs and embroidery." } },
    { id: "bandura", uk: "бандура", tr: "ban-DU-ra", en: "bandura (folk instrument)", ic: "@bandura", acc: "бандуру", fact: { uk: "Кобзарі грали на бандурі й співали давні пісні.", en: "Kobzars, travelling singers, played the bandura and sang old epic songs." } },
    { id: "korovai", uk: "коровай", tr: "ko-ro-VAI", en: "festive bread", ic: "@korovai", fact: { uk: "Коровай печуть на весілля.", en: "Korovai is a rich round bread baked for weddings, decorated with dough flowers and birds." } },
    { id: "didukh", uk: "дідух", tr: "di-DUKH", en: "Christmas wheat sheaf", ic: "@didukh", fact: { uk: "Дідух стоїть у хаті на Різдво.", en: "A didukh, a sheaf of wheat, stands in the home at Christmas to honour the ancestors and the harvest." } },
    { id: "malva", uk: "мальва", tr: "MAL-va", en: "hollyhock", ic: "@malva", acc: "мальву", fact: { uk: "Мальви ростуть біля сільських хат.", en: "Hollyhocks grow beside village cottages, and they are painted in folk art." } },
    { id: "vyshyvanka", uk: "вишиванка", tr: "vy-shy-VAN-ka", en: "embroidered shirt", ic: "@vyshyvanka", acc: "вишиванку", fact: { uk: "Кожен край має свою вишивку.", en: "Every region has its own embroidery. Vyshyvanka Day is in May." } },
    { id: "vinok", uk: "вінок", tr: "vi-NOK", en: "flower wreath", ic: "@vinok", fact: { uk: "Вінок із квітів і стрічок носять на свято.", en: "Wreaths of flowers and ribbons are worn at festivals and weddings." } },
    { id: "mak", uk: "мак", tr: "mak", en: "poppy", ic: "@mak", fact: { uk: "Мак часто вишивають і малюють.", en: "Poppies are embroidered and painted in folk art, and their seeds go into sweet rolls." } },
    { id: "pshenytsia", uk: "пшениця", tr: "psheh-NY-tsia", en: "wheat", ic: "@pshenytsia", acc: "пшеницю", fact: { uk: "Золоті поля пшениці — символ України.", en: "Ukraine is famous for its wheat. Golden fields under a blue sky are a symbol of the country." } },
    { id: "tarilka", uk: "тарілка", tr: "ta-RIL-ka", en: "painted plate", ic: "@tarilka", acc: "тарілку", fact: { uk: "Петриківський розпис — це яскраві квіти.", en: "Petrykivka painting, full of bright flowers, is a folk art that UNESCO listed in 2013." } },
    { id: "paska", uk: "паска", tr: "PAS-ka", en: "Easter bread", ic: "@paska", acc: "паску", fact: { uk: "Паску печуть на Великдень.", en: "Paska is a tall Easter bread. It is blessed in church in a basket with painted eggs." } },
    { id: "motanka", uk: "мотанка", tr: "mo-TAN-ka", en: "rag doll", ic: "@motanka", acc: "мотанку", fact: { uk: "Мотанка — лялька без обличчя.", en: "The motanka is a rag doll with no face, made as a lucky charm for children." } },
    // --- for the cats
    { id: "kihtetochka", uk: "кігтеточка", tr: "kih-te-TOCH-ka", en: "cat tree", ic: "@cattree", acc: "кігтеточку" },
    { id: "lezhanka", uk: "лежанка", tr: "le-ZHAN-ka", en: "cat bed", ic: "@catbed", acc: "лежанку" },
    { id: "miachyk", uk: "м'ячик", tr: "MIA-chyk", en: "little ball", ic: "@ball" },
    { id: "myshka", uk: "мишка", tr: "MYSH-ka", en: "toy mouse", ic: "@toymouse", acc: "мишку" },
    // --- tools and things you carry
    { id: "nasinnia", uk: "насіння", tr: "na-SIN-nia", en: "seeds", ic: "🌱" },
    { id: "vudka", uk: "вудка", tr: "VUD-ka", en: "fishing rod", ic: "@rod", acc: "вудку" },
    { id: "liika", uk: "лійка", tr: "LIY-ka", en: "watering can", ic: "@can", acc: "лійку" },
    { id: "koshyk", uk: "кошик", tr: "KO-shyk", en: "basket", ic: "🧺" },
    { id: "hroshi", uk: "гроші", tr: "HRO-shi", en: "money", ic: "💰" }
  ],

  // Phrases in the teacher's voice: things you say, and the guide's instructions.
  phrases: [
    { id: "pryvit", uk: "Привіт!", en: "Hi!" },
    { id: "dobryi_den", uk: "Добрий день!", en: "Good day!" },
    { id: "diakuiu", uk: "Дякую!", en: "Thank you!" },
    { id: "bud_laska", uk: "Будь ласка.", en: "Please. / You're welcome." },
    { id: "tak", uk: "Так.", en: "Yes." },
    { id: "ni", uk: "Ні.", en: "No." },
    { id: "do_pobachennia", uk: "До побачення!", en: "Goodbye!" },
    { id: "dobre_diakuiu", uk: "Добре, дякую!", en: "Good, thanks!" },
    { id: "chudovo", uk: "Чудово!", en: "Wonderful!" },
    { id: "nepohano", uk: "Непогано.", en: "Not bad." },
    { id: "shcho_tse", uk: "Що це?", en: "What is this?" },
    { id: "skilky", uk: "Скільки коштує?", en: "How much is it?" },
    { id: "os", uk: "Ось, будь ласка.", en: "Here you go." },
    { id: "molodets", uk: "Молодець!", en: "Well done!" },
    { id: "nove_slovo", uk: "Нове слово!", en: "A new word!" },
    { id: "mur", uk: "Мур-мур! Тепер ми друзі.", en: "Purr! Now we are friends." },
    { id: "duzhe_smachno", uk: "Дуже смачно! Дякую!", en: "Very tasty! Thank you!" },
    { id: "moia_khata", uk: "Моя хата.", en: "My cottage." },
    { id: "no_water", uk: "Немає води. Іди до криниці.", en: "No water. Go to the well." },
    { id: "ne_budu", uk: "Вибачте, не буду.", en: "Sorry, I won't." },
    { id: "vizmu", uk: "Візьму все одно.", en: "I'll take it anyway." },
    { id: "need_rod", uk: "Потрібна вудка.", en: "You need a fishing rod." },
    { id: "i_explore", uk: "Оглянь село.", en: "Look around the village." },
    { id: "i_talk", uk: "Поговори з бабою Олею.", en: "Talk to Grandma Olia." },
    { id: "i_plant", uk: "Посади насіння.", en: "Plant the seeds." },
    { id: "i_water", uk: "Полий город.", en: "Water the garden." },
    { id: "i_harvest", uk: "Збери врожай.", en: "Gather the harvest." },
    { id: "i_market", uk: "Іди на ринок.", en: "Go to the market." },
    { id: "i_decor", uk: "Прикрась хату.", en: "Decorate the cottage." },
    { id: "i_free", uk: "Гуляй і допомагай сусідам.", en: "Wander, and help your neighbours." }
  ],

  // Villagers. voice = Gemini voice, style = how they should sound.
  npcs: [
    {
      id: "olia", name: "Баба Оля", nameEn: "Grandma Olia", voice: "gacrux",
      style: "A kind, warm elderly Ukrainian grandmother. Speaks Ukrainian slowly, clearly and lovingly.",
      look: { skin: "#f3cfb0", shirt: "#ffffff", trim: "#d43a3a", skirt: "#7a3b3b", hair: "#cfcfcf", hat: "scarf", hatCol: "#d43a3a" },
      lines: {
        greet: { uk: "Добрий день, сонечко!", en: "Good day, sunshine!" },
        intro: { uk: "Я — баба Оля. Я варю борщ.", en: "I'm Grandma Olia. I'm cooking borscht." },
        how: { uk: "Як справи?", en: "How are you?" },
        good: { uk: "Це добре!", en: "That's good!" },
        thanks: { uk: "Дякую, сонечко! Ти молодець!", en: "Thank you, sunshine! Well done!" },
        recipe_borshch: { uk: "Я варю борщ! Допоможеш мені?", en: "I'm making borscht! Will you help me?" },
        ready_borshch: { uk: "Борщ готовий! Сідай, їж, сонечко!", en: "The borscht is ready! Sit down and eat, sunshine!" },
        recipe_varenyky: { uk: "А тепер — вареники! Допоможеш?", en: "And now, varenyky! Will you help?" },
        ready_varenyky: { uk: "Вареники готові! Смачного!", en: "The varenyky are ready! Enjoy your meal!" },
        recipe_deruny: { uk: "Сьогодні я смажу деруни. Допоможеш?", en: "Today I'm frying deruny. Will you help?" },
        ready_deruny: { uk: "Деруни готові! Їж, поки гарячі!", en: "The deruny are ready! Eat them while they're hot!" },
        recipe_holubtsi: { uk: "Тепер я роблю голубці. Допоможеш?", en: "Now I'm making holubtsi. Will you help?" },
        ready_holubtsi: { uk: "Голубці готові! Смачного, сонечко!", en: "The holubtsi are ready! Enjoy, sunshine!" },
        recipe_syrnyky: { uk: "А на десерт — сирники! Допоможеш?", en: "And for dessert, syrnyky! Will you help?" },
        ready_syrnyky: { uk: "Сирники готові! Бери, поки теплі!", en: "The syrnyky are ready! Take them while they're warm!" }
      },
      wants: ["kapusta", "kartoplia", "morkva", "tsybulia", "chasnyk", "pomidor", "sil", "yaitse", "maslo", "buriak", "boroshno", "syr", "rys", "med"]
    },
    {
      id: "taras", name: "Тарас", nameEn: "Taras", voice: "orus",
      style: "A relaxed, friendly Ukrainian fisherman in his forties. Speaks Ukrainian clearly, unhurried.",
      look: { skin: "#eec39a", shirt: "#f7f3e8", trim: "#2c5fa8", skirt: "#3d5a80", hair: "#5a3a22", hat: "straw", hatCol: "#e8c66a" },
      lines: {
        greet: { uk: "Привіт! Гарний день, правда?", en: "Hi! A lovely day, isn't it?" },
        intro: { uk: "Мене звати Тарас. Я ловлю рибу.", en: "My name is Taras. I catch fish." },
        how: { uk: "Як справи?", en: "How are you?" },
        good: { uk: "Це добре!", en: "That's good!" },
        thanks: { uk: "О, дякую! Дуже смачно!", en: "Oh, thank you! Very tasty!" }
      },
      wants: ["khlib", "syr", "chai", "pyrih", "ohirok"]
    },
    {
      id: "andriiko", name: "Андрійко", nameEn: "Andriiko", voice: "puck",
      style: "A cheerful, playful young Ukrainian boy. Speaks Ukrainian brightly and clearly.",
      look: { skin: "#f6d2b3", shirt: "#ffffff", trim: "#2e9e5b", skirt: "#3a7d44", hair: "#e0b34c", hat: "none", hatCol: "#000", small: true },
      lines: {
        greet: { uk: "Привіт! Пограймося?", en: "Hi! Shall we play?" },
        intro: { uk: "Я — Андрійко. А це мій собака Бровко.", en: "I'm Andriiko. And this is my dog Brovko." },
        how: { uk: "Як справи?", en: "How are you?" },
        good: { uk: "Це добре!", en: "That's good!" },
        thanks: { uk: "Ура! Дякую!", en: "Hooray! Thanks!" }
      },
      wants: ["yabluko", "hrusha", "vyshnia", "polunytsia", "kavun", "med"]
    },
    {
      id: "bohdan", name: "Пан Богдан", nameEn: "Mr. Bohdan", voice: "algieba",
      style: "A gentle, thoughtful older Ukrainian beekeeper. Speaks Ukrainian calmly and clearly.",
      look: { skin: "#eabf98", shirt: "#fff8e6", trim: "#c98a1a", skirt: "#6b4f2a", hair: "#8a8a8a", hat: "straw", hatCol: "#f1dfa0" },
      lines: {
        greet: { uk: "Добрий день! Радий тебе бачити.", en: "Good day! Glad to see you." },
        intro: { uk: "Я — пан Богдан. Це мої бджоли.", en: "I'm Mr. Bohdan. These are my bees." },
        how: { uk: "Як справи?", en: "How are you?" },
        good: { uk: "Це добре!", en: "That's good!" },
        thanks: { uk: "Щиро дякую!", en: "Thank you kindly!" },
        mine: { uk: "Гей! Це мої соняшники!", en: "Hey! Those are my sunflowers!" },
        ok: { uk: "Дякую. Насіння соняшнику є на ринку.", en: "Thank you. Sunflower seeds are sold at the market." },
        angry: { uk: "Я з тобою більше не торгую.", en: "I don't do business with you any more." }
      },
      wants: ["kvitka", "soniashnyk", "voda", "harbuz", "kukurudza", "hryb"]
    },
    {
      id: "oksana", name: "Оксана", nameEn: "Oksana", voice: "aoede",
      style: "A bright, welcoming young Ukrainian market seller. Speaks Ukrainian clearly and cheerfully.",
      look: { skin: "#f5cfae", shirt: "#ffffff", trim: "#d43a3a", skirt: "#2c5fa8", hair: "#6b3d1e", hat: "wreath", hatCol: "#ff7aa8" },
      lines: {
        greet: { uk: "Доброго ранку! Що бажаєте?", en: "Good morning! What would you like?" },
        intro: { uk: "Я — Оксана. Тут усе свіже!", en: "I'm Oksana. Everything here is fresh!" },
        thanks: { uk: "Дякую за допомогу!", en: "Thank you for the help!" }
      },
      wants: []
    }
  ],

  // Grandma Olia's cooking. She asks for each ingredient in turn, then cooks the dish and you eat together.
  recipes: [
    { id: "borshch", dish: "borshch", needs: ["buriak", "kapusta", "kartoplia", "morkva", "tsybulia", "pomidor"] },
    { id: "varenyky", dish: "varenyky", needs: ["boroshno", "kartoplia", "tsybulia", "syr", "maslo"] },
    { id: "deruny", dish: "deruny", needs: ["kartoplia", "tsybulia", "yaitse", "boroshno", "sil"] },
    { id: "holubtsi", dish: "holubtsi", needs: ["kapusta", "rys", "tsybulia", "morkva", "pomidor"] },
    { id: "syrnyky", dish: "syrnyky", needs: ["syr", "yaitse", "boroshno", "med"] }
  ],

  // The valley's cats. Bring each one the treat it wants and it becomes your friend
  // (and comes to sit in your cottage). v = colouring, x/y = where it wanders.
  cats: [
    { id: "rudko", v: "rudyi", word: "rudyi_kit", name: "Рудько", wants: "ryba", x: 8.6, y: 15.6, line: "Рудий кіт хоче рибу.", lineEn: "The ginger cat wants fish." },
    { id: "vuhlyk", v: "chornyi", word: "chornyi_kit", name: "Вуглик", wants: "moloko", x: 22.4, y: 12.4, line: "Чорний кіт хоче молоко.", lineEn: "The black cat wants milk." },
    { id: "snizhok", v: "bilyi", word: "bilyi_kit", name: "Сніжок", wants: "syr", x: 17.2, y: 20.8, line: "Білий кіт хоче сир.", lineEn: "The white cat wants cheese." },
    { id: "dymok", v: "siryi", word: "siryi_kit", name: "Димок", wants: "voda", x: 26.4, y: 17.6, line: "Сірий кіт хоче воду.", lineEn: "The grey cat wants water." },
    { id: "smuhastyk", v: "smuhastyi", word: "smuhastyi_kit", name: "Смугастик", wants: "yaitse", x: 10.2, y: 21.4, line: "Смугастий кіт хоче яйце.", lineEn: "The striped cat wants an egg." },
    { id: "murka", v: "trykolirna", word: "trykolirna_kishka", name: "Мурка", wants: "maslo", x: 27.4, y: 8.2, line: "Триколірна кішка хоче масло.", lineEn: "The calico cat wants butter." }
  ],

  // Grandma Olia's letter on the title screen: the valley's story, and how to play.
  // pics: "face:<npc>", "w:<word id>" or a plain emoji.
  story: [
    { uk: "Привіт, сонечко! Це баба Оля.", pics: ["face:olia", "📜"],
      en: "Hello, sunshine! It's Grandma Olia. The little cottage at the end of the road is yours now. Come and live with us in Котяча Долина, Kotiacha Dolyna: Cat Valley." },
    { uk: "У нас багато котів!", pics: ["w:kit", "w:khata", "w:kit"],
      en: "Our valley has more cats than people, sunflowers everywhere, and a stork on the pole by the road. Everyone here speaks Ukrainian. Don't worry: you'll pick it up just by living here." },
    { uk: "Торкнись — і почуєш слово.", pics: ["👆", "w:yablunia", "✨"],
      en: "Tap anything to walk over and hear its name. Things that sparkle ✨ are new to you, or a word that's due for a refresher. Tap the 🔊 to hear any word again. Many things also carry a little 🌾 note about Ukrainian culture." },
    { uk: "Сусіди попросять про допомогу.", pics: ["face:andriiko", "w:morkva", "w:yabluko"],
      en: "The neighbours will ask you for things. Grow vegetables in your garden, pick apples, draw water from the well, catch a fish, or buy from Oksana's market stall. Bring them what they ask for and they'll gladly pay you for it. Grandma Olia cooks a different dish each time and thanks you with hearts. The cats get hungry too: bring each one its favourite treat and it becomes your friend." },
    { uk: "Прикрась свою хату.", pics: ["w:khata", "w:kartyna", "w:vazon"],
      en: "Spend your coins on lovely things at the market, then go into your cottage and tap the 🪑 Прикрасити (Decorate) button to place them and make it home." },
    { uk: "Спершу з перекладом, а потім — українською.", pics: ["📖", "👁️", "❤️"],
      en: "At first everything has English with it. As you learn, the English quietly fades away. Tap 👁 to peek whenever you need to. Your word book 📖 shows how far you've come." },
    { uk: "Чекаю на тебе! Обіймаю, баба Оля.", pics: ["face:olia", "❤️", "w:borshch"],
      en: "I'll be waiting for you, with something tasty on the stove. Hugs, Grandma Olia." }
  ],

  // "Bring me, please, ..." — the item goes on the end in its acc form.
  questLine: { uk: "Принеси мені, будь ласка, %s.", en: "Bring me, please, %s." },
  // Villagers' errands: they offer to pay (6 ₴, the errand reward).
  payLine: { uk: "Я з радістю заплачу тобі шість гривень за %s.", en: "I'll gladly pay you 6 ₴ for %s." },

  // Prices are spoken by Oksana. Ukrainian counts money in three ways: 2-4 гривні, 5+ гривень.
  prices: {
    2: "Дві гривні.", 3: "Три гривні.", 4: "Чотири гривні.", 5: "П'ять гривень.", 6: "Шість гривень.",
    8: "Вісім гривень.", 10: "Десять гривень.", 15: "П'ятнадцять гривень.", 20: "Двадцять гривень."
  },

  shop: {
    food: { boroshno: 3, khlib: 5, moloko: 4, syr: 6, yaitse: 2, med: 8, maslo: 5, hrusha: 3, vyshnia: 3, kavun: 8, chai: 4, sil: 2, pyrih: 6, varenyky: 6, borshch: 6, deruny: 6, holubtsi: 7, syrnyky: 6, rys: 3, korovai: 10, paska: 10 },
    seeds: { buriak: 2, morkva: 2, kartoplia: 2, kapusta: 2, tsybulia: 2, chasnyk: 2, pomidor: 3, ohirok: 3, harbuz: 4, kukurudza: 3, polunytsia: 4, soniashnyk: 3 },
    home: { vazon: 6, chashka: 4, svichka: 4, knyha: 5, kvity: 5, lampa: 8, hlechyk: 8, rushnyk: 8, pysanka: 6, motanka: 8, tarilka: 10, vinok: 8, didukh: 10, vyshyvanka: 12, bandura: 20, kartyna: 10, dzerkalo: 10, hodynnyk: 10, kylym: 15 },
    // Toys and furniture for the cat friends (they use them).
    tools: { vudka: 6 },
    cats: { kihtetochka: 15, lezhanka: 8, miachyk: 3, myshka: 3 },
    // Furniture the cottage comes with. Not for sale; tap it in the room to learn its name.
    furnished: { pich: 20, lizhko: 20, stil: 15, stilets: 10, polytsia: 0 }
  },

  // Which cottage items hang on the wall (the rest stand on the floor).
  wallItems: ["kartyna", "dzerkalo", "hodynnyk", "rushnyk", "vyshyvanka", "bandura", "tarilka", "vinok"],

  // Short labels on buttons and panels: Ukrainian first, English fades out as you learn.
  ui: {
    take: ["Взяти", "Take"], enter: ["Зайти", "Go in"], exit: ["Вийти", "Go out"], buy: ["Купити", "Buy"],
    sell: ["Продати", "Sell"], plant: ["Посадити", "Plant"], water: ["Полити", "Water"], harvest: ["Зібрати", "Harvest"],
    next: ["Далі", "Next"], close: ["Добре", "OK"], give: ["Дати", "Give"], putaway: ["Прибрати", "Put away"],
    food: ["Їжа", "Food"], seeds: ["Насіння", "Seeds"], home: ["Для хати", "For the cottage"], help: ["Допомогти", "Help out"],
    bag: ["Кошик", "Basket"], words: ["Словник", "Word book"], show: ["Показати", "Show English"],
    empty: ["Порожньо", "Empty"], growing: ["Росте...", "Growing..."], thirsty: ["Хоче пити", "Needs water"],
    start: ["Почати", "Start"], decor: ["Прикрасити", "Decorate"], plantit: ["У тебе є насіння. Посади його на городі!", "You have %s seeds: plant them in your garden, water them, and harvest."], tools: ["Знаряддя", "Tools"], fish: ["Ловити рибу", "Go fishing"], have: ["Є", "You have it"], allin: ["Усе вже в хаті!", "Everything you own is in your cottage. Buy more at the market, or tap something in the room to put it away."], cats: ["Для котів", "For the cats"], fill: ["Набрати води", "Draw water"], towell: ["До криниці", "To the well"], notenough: ["Мало грошей", "Not enough money"], place: ["Поставити", "Place"]
  }
};
