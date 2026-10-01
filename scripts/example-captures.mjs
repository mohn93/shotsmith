// Fictional app captures for the examples: iPhone and Android phone, English and German.
//   node scripts/example-captures.mjs
// Writes examples/<app>/inputs/<platform>/<locale>/<name>.png and a review sheet at test/.tmp/example-captures.png.
// Ported from storeshot scripts/build-fictional-templates.mjs; iPhone English output is unchanged from it.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let cur = { platform: "iphone", locale: "en" };

// German UI text. Keys are the English strings exactly as drawn.
const DE = {
  "Good morning, Alex": "Guten Morgen, Alex", "A little progress adds up.": "Kleine Schritte zählen.",
  "TODAY AT A GLANCE": "HEUTE AUF EINEN BLICK", "4 of 5": "4 von 5", "habits completed": "Gewohnheiten erledigt",
  "Your rituals": "Deine Rituale", "See all": "Alle", "Morning walk": "Morgenspaziergang",
  "20 minutes outside": "20 Minuten draußen", "Read a chapter": "Ein Kapitel lesen",
  "Make space for stories": "Zeit für Geschichten", "Pause and breathe": "Innehalten und atmen",
  "A moment for yourself": "Ein Moment für dich", "Home": "Start", "Explore": "Entdecken",
  "Saved": "Gespeichert", "You": "Profil", "Your momentum": "Dein Schwung",
  "Small steps, strong streaks.": "Kleine Schritte, starke Serien.", "THIS WEEK": "DIESE WOCHE",
  "86%": "86 %", "completion": "erledigt", "The last 7 days": "Die letzten 7 Tage",
  "M": "M", "T": "D", "W": "M", "F": "F", "S": "S",
  "A habit worth keeping": "Eine Gewohnheit, die bleibt",
  "Your reading streak is at 12 days.": "Deine Leseserie steht bei 12 Tagen.",
  "Find your rhythm": "Dein Rhythmus", "A routine that feels like yours.": "Eine Routine, die zu dir passt.",
  "MORNING ROUTINE": "MORGENROUTINE", "Start softly": "Sanft starten",
  "Three simple moments before work": "Drei kleine Momente vor der Arbeit", "Today’s plan": "Dein Plan für heute",
  "Move your body": "Bewegung", "A gentle walk": "Ein ruhiger Spaziergang", "Write one line": "Eine Zeile schreiben",
  "Capture a thought": "Einen Gedanken festhalten", "Take a break": "Pause machen",
  "Step away and reset": "Abstand nehmen, durchatmen", "+ Add a ritual": "+ Ritual hinzufügen",
  "What sounds good?": "Worauf hast du Lust?", "Fresh ideas for your table.": "Frische Ideen für deinen Tisch.",
  "⌕  Search recipes and ingredients": "⌕  Rezepte und Zutaten suchen", "Tonight’s pick": "Tipp des Abends",
  "20 MIN · EASY": "20 MIN · EINFACH", "Golden": "Goldene", "tomato pasta": "Tomatenpasta",
  "View recipe": "Zum Rezept", "Quick and lovely": "Schnell und köstlich",
  "Crispy chickpea bowls": "Knusprige Kichererbsen-Bowls", "15 min · Vegetarian": "15 Min · Vegetarisch",
  "Lemon & herb": "Zitrone & Kräuter", "A dinner worth slowing down for.": "Ein Abendessen, für das man sich Zeit nimmt.",
  "25 MIN": "25 MIN", "4 SERVES": "4 PORTIONEN", "What you’ll need": "Das brauchst du",
  "Lemons": "Zitronen", "2 fresh": "2 frische", "Herbs": "Kräuter", "A handful": "Eine Handvoll",
  "Olive oil": "Olivenöl", "2 tbsp": "2 EL", "Your week, sorted": "Deine Woche, geplant",
  "Good food without the guesswork.": "Gutes Essen ohne Rätselraten.", "SEPTEMBER": "SEPTEMBER",
  "MON": "MO", "TUE": "DI", "WED": "MI", "THU": "DO", "FRI": "FR", "On the menu": "Auf dem Speiseplan",
  "LUNCH": "MITTAG", "DINNER": "ABEND", "Roasted pepper bowls": "Bowls mit Ofenpaprika",
  "Colorful, crisp, ready in 20.": "Bunt, knackig, in 20 fertig.", "Herby lemon pasta": "Zitronenpasta mit Kräutern",
  "A bright finish to the day.": "Ein frischer Abschluss des Tages.", "+ Add a meal": "+ Gericht planen",
  "Where to next?": "Wohin als Nächstes?", "Your plans, all in one place.": "Deine Pläne, alle an einem Ort.",
  "UPCOMING TRIP": "NÄCHSTE REISE", "Lisbon in spring": "Lissabon im Frühling",
  "Apr 12–18  ·  6 days": "12.–18. Apr.  ·  6 Tage", "Your itinerary": "Dein Reiseplan",
  "Flight to Lisbon": "Flug nach Lissabon", "Sat, Apr 12 · 09:35": "Sa., 12. Apr. · 09:35",
  "Check-in after 15:00": "Check-in ab 15:00", "A day in Lisbon": "Ein Tag in Lissabon",
  "Monday, April 14  ·  Day 3": "Montag, 14. April  ·  Tag 3", "← Day 2": "← Tag 2", "Day 4 →": "Tag 4 →",
  "Coffee in Alfama": "Kaffee in der Alfama", "Start the morning slowly": "Den Morgen ruhig beginnen",
  "Tram through the hills": "Mit der Tram durch die Hügel", "A winding city ride": "Eine kurvige Stadtfahrt",
  "Lunch by the water": "Mittagessen am Wasser", "Fresh plates and sea air": "Frische Teller und Meeresluft",
  "Sunset lookout": "Sonnenuntergang", "Bring your camera": "Kamera nicht vergessen",
  "Explore nearby": "Entdecke die Nähe", "Good places, close to you.": "Gute Orte, ganz in deiner Nähe.",
  "Miradouro lookout": "Aussichtspunkt Miradouro", "A beautiful view of the city": "Ein schöner Blick über die Stadt",
};
// Drawn as is in every locale: brands, place names, times, numbers and symbols.
const KEEP = new Set(["DAILY ARC", "SAVORY", "ELSEWHERE", "Casa do Sol"]);
const tr = (value) => {
  const s = String(value);
  if (cur.locale === "en") return s;
  if (s in DE) return DE[s];
  if (KEEP.has(s) || /^[\d:.\s]+$/.test(s) || /^[☀✓✦○✈⌂]$/u.test(s)) return s;
  throw new Error(`No German text for "${s}"`);
};
const e = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
const R = (x,y,w,h,fill,r=0,stroke='none',sw=0) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
const T = (x,y,value,size=16,color='#18242c',weight=500,extra='') => `<text x="${x}" y="${y}" fill="${color}" font-family="Inter,Arial,sans-serif" font-size="${size}" font-weight="${weight}" ${extra}>${e(tr(value))}</text>`;
const C = (x,y,r,fill) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;
const L = (x1,y1,x2,y2,color='#dbe3e5',width=1) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}"/>`;
const pill = (x,y,w,label,bg,fg) => R(x,y,w,30,bg,15)+T(x+14,y+20,label,12,fg,700);
const shellIphone = ({bg='#f7f8f5',ink='#172b34',accent='#327a70',brand,title,subtitle,content,tab='Home'}) => `
<svg xmlns="http://www.w3.org/2000/svg" width="390" height="844" viewBox="0 0 390 844">
${R(0,0,390,844,bg)}${T(28,33,'9:41',15,ink,700)}${R(326,20,18,10,ink,3)}${R(348,20,13,10,ink,2)}${C(372,25,6,ink)}
${T(27,87,brand.toUpperCase(),12,accent,800,'letter-spacing="2"')}${T(27,128,title,32,ink,800)}${T(27,154,subtitle,14,'#71818a',500)}
${content}${R(0,774,390,70,'#ffffff')}${L(0,774,390,774,'#e7ebe9')}
${[['Home',39],['Explore',136],['Saved',235],['You',330]].map(([name,x])=>`${C(x+8,796,7,name===tab?accent:'#b9c4c5')}${T(x,825,name,11,name===tab?accent:'#9aa8a9',name===tab?700:500)}`).join('')}
</svg>`;

// Material shell: 411 dp wide at 2.625x (1080x2400). The iPhone content is drawn unchanged, centred, under an
// Android status bar, with a bottom navigation bar and gesture handle.
const shellAndroid = ({bg='#f7f8f5',ink='#172b34',accent='#327a70',brand,title,subtitle,content,tab='Home'}) => `
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="2400" viewBox="0 0 411 913.33">
${R(0,0,411,913.33,bg)}${T(22,26,'9:41',14,ink,500)}
<path d="M338 23 l8 -10 l8 10 z" fill="${ink}"/>${R(360,15,5,9,ink,1)}${R(367,12,5,12,ink,1)}${R(379,13,19,10,ink,2.5)}
<g transform="translate(10.5 12)">
${T(27,87,brand.toUpperCase(),12,accent,800,'letter-spacing="2"')}${T(27,128,title,32,ink,800)}${T(27,154,subtitle,14,'#71818a',500)}
${content}
</g>
${R(0,809.33,411,104,'#ffffff')}${L(0,809.33,411,809.33,'#e7ebe9')}
${['Home','Explore','Saved','You'].map((name,i)=>{const cx=51.4+i*102.75, on=name===tab; return `${on?R(cx-32,821,64,32,`${accent}26`,16):''}${C(cx,837,7,on?accent:'#b9c4c5')}${T(cx,869,name,12,on?ink:'#6f7d80',on?700:500,'text-anchor="middle"')}`;}).join('')}
${R(151.5,897,108,4,ink,2)}
</svg>`;
const shell = (o) => (cur.platform === 'iphone' ? shellIphone : shellAndroid)(o);
const card = (y,h,fill='#fff') => R(24,y,342,h,fill,22);
const progress = (x,y,w,p,color,bg='#e4e9e7') => R(x,y,w,9,bg,5)+R(x,y,Math.round(w*p),9,color,5);
const lines = (x,y,w,color='#d9e1e1') => R(x,y,w,7,color,4)+R(x,y+16,w*.72,7,color,4);
const leaf = (x,y,s,color) => `<path d="M${x} ${y}c${-s*.7} ${-s*.3} ${-s*.9} ${-s} 0 ${-s*1.4}c${s*.8} ${s*.3} ${s*.9} ${s} 0 ${s*1.4}Z" fill="${color}"/><path d="M${x} ${y}v${s*.8}" stroke="${color}" stroke-width="3"/>`;

const screens = () => ({
  'daily-home': shell({brand:'Daily Arc',title:'Good morning, Alex',subtitle:'A little progress adds up.',accent:'#278875',content:
    card(186,196,'#dceee7')+T(45,221,'TODAY AT A GLANCE',11,'#357268',800)+T(45,286,'4 of 5',50,'#143f39',800)+T(45,316,'habits completed',16,'#386760')+progress(45,342,298,.8,'#278875','#bddbd1')+
    T(26,425,'Your rituals',22,'#172b34',800)+pill(283,398,82,'See all','#e1efe9','#278875')+
    card(447,76)+C(62,485,21,'#f8dfbe')+T(53,491,'☀',21,'#a76b24')+T(97,478,'Morning walk',17,'#172b34',700)+T(97,502,'20 minutes outside',12,'#8b9a9d')+C(336,485,14,'#278875')+T(330,491,'✓',17,'#fff',700)+
    card(535,76)+C(62,573,21,'#d8e5ff')+T(54,580,'✦',21,'#486dab')+T(97,566,'Read a chapter',17,'#172b34',700)+T(97,590,'Make space for stories',12,'#8b9a9d')+C(336,573,14,'#278875')+T(330,579,'✓',17,'#fff',700)+
    card(623,76)+C(62,661,21,'#eadff5')+T(55,668,'○',22,'#8d68ac')+T(97,654,'Pause and breathe',17,'#172b34',700)+T(97,678,'A moment for yourself',12,'#8b9a9d')+C(336,661,14,'#e6eeec'),tab:'Home'}),
  'daily-insights': shell({brand:'Daily Arc',title:'Your momentum',subtitle:'Small steps, strong streaks.',accent:'#278875',content:
    card(188,177,'#173f3b')+T(45,226,'THIS WEEK',12,'#9cdbca',800)+T(45,294,'86%',57,'#fff',800)+T(192,287,'completion',17,'#c3e5da')+progress(46,328,295,.86,'#91dec3','#3d6860')+
    T(27,411,'The last 7 days',22,'#172b34',800)+card(433,165)+[.46,.68,.8,.55,.92,.75,.86].map((p,i)=>R(49+i*43,553-p*98,23,p*98,i===6?'#278875':'#aed9ca',8)).join('')+
    ['M','T','W','T','F','S','S'].map((day,i)=>T(54+i*43,582,day,11,'#8fa09e',700)).join('')+
    card(616,113,'#e8f4ef')+T(46,653,'A habit worth keeping',16,'#1a4d43',800)+T(46,681,'Your reading streak is at 12 days.',14,'#54756c'),tab:'Explore'}),
  'daily-rituals': shell({brand:'Daily Arc',title:'Find your rhythm',subtitle:'A routine that feels like yours.',accent:'#278875',content:
    card(186,144,'#fff1dd')+T(46,226,'MORNING ROUTINE',11,'#ae7341',800)+T(46,264,'Start softly',29,'#5d3a2e',800)+T(46,292,'Three simple moments before work',13,'#9f8069')+C(325,254,25,'#ffd69c')+
    T(27,373,'Today’s plan',22,'#172b34',800)+
    [[405,'07:30','Move your body','A gentle walk'],[490,'08:00','Write one line','Capture a thought'],[575,'12:30','Take a break','Step away and reset']].map(([y,time,title,sub])=>card(y,75)+T(43,y+32,time,12,'#278875',800)+T(115,y+31,title,16,'#172b34',700)+T(115,y+52,sub,12,'#8b9a9d')+C(337,y+37,10,'#d9e9e4')).join('')+
    pill(27,684,155,'+ Add a ritual','#278875','#fff'),tab:'Saved'}),
  'savory-home': shell({bg:'#fff8f0',ink:'#3f2924',accent:'#e45d3f',brand:'Savory',title:'What sounds good?',subtitle:'Fresh ideas for your table.',content:
    R(24,184,342,47,'#fff',17)+T(45,215,'⌕  Search recipes and ingredients',14,'#b4a198')+
    T(27,272,'Tonight’s pick',22,'#3f2924',800)+card(293,255,'#e96949')+C(300,350,65,'#f8c46d')+C(300,350,45,'#f2e5be')+C(278,338,12,'#c73d2d')+C(319,360,12,'#c73d2d')+leaf(306,342,15,'#3d8952')+T(45,350,'20 MIN · EASY',12,'#ffdbc8',800)+T(45,399,'Golden',29,'#fff',800)+T(45,432,'tomato pasta',29,'#fff',800)+pill(45,485,132,'View recipe','#fff','#cc4b35')+
    T(27,591,'Quick and lovely',21,'#3f2924',800)+card(615,105)+C(78,667,31,'#f4bd83')+T(124,654,'Crispy chickpea bowls',15,'#3f2924',700)+T(124,680,'15 min · Vegetarian',12,'#9e8e83'),tab:'Home'}),
  'savory-recipe': shell({bg:'#fff8f0',ink:'#3f2924',accent:'#e45d3f',brand:'Savory',title:'Lemon & herb',subtitle:'A dinner worth slowing down for.',content:
    card(185,286,'#f5d9ad')+C(194,330,105,'#fff5dc')+C(194,330,82,'#e3ba7b')+C(168,304,27,'#eb774c')+C(220,352,31,'#e57a50')+leaf(183,356,34,'#4e955e')+leaf(227,307,25,'#558d54')+
    pill(28,490,95,'25 MIN','#fce9dc','#bd563e')+pill(133,490,109,'4 SERVES','#fce9dc','#bd563e')+
    T(27,567,'What you’ll need',22,'#3f2924',800)+card(588,145)+[['Lemons','2 fresh'],['Herbs','A handful'],['Olive oil','2 tbsp']].map(([a,b],i)=>T(47,624+i*36,a,15,'#493630',700)+T(282,624+i*36,b,13,'#9e8e83')).join(''),tab:'Explore'}),
  'savory-plan': shell({bg:'#fff8f0',ink:'#3f2924',accent:'#e45d3f',brand:'Savory',title:'Your week, sorted',subtitle:'Good food without the guesswork.',content:
    T(28,211,'SEPTEMBER',12,'#c46b4c',800)+[0,1,2,3,4].map((i)=>R(26+i*72,232,63,68,i===2?'#e45d3f':'#fff',14)+T(44+i*72,261,['MON','TUE','WED','THU','FRI'][i],11,i===2?'#fff':'#ad978b',700)+T(48+i*72,287,String(22+i),19,i===2?'#fff':'#3f2924',800)).join('')+
    T(27,355,'On the menu',23,'#3f2924',800)+card(378,132,'#fce6d2')+T(47,418,'LUNCH',12,'#b15e45',800)+T(47,456,'Roasted pepper bowls',19,'#3f2924',800)+T(47,483,'Colorful, crisp, ready in 20.',13,'#906e5f')+
    card(523,132,'#e4ead5')+T(47,563,'DINNER',12,'#64824e',800)+T(47,601,'Herby lemon pasta',19,'#3f2924',800)+T(47,628,'A bright finish to the day.',13,'#6d8160')+
    pill(27,680,171,'+ Add a meal','#e45d3f','#fff'),tab:'Saved'}),
  'elsewhere-trips': shell({bg:'#f0f7f8',ink:'#12333f',accent:'#087e90',brand:'Elsewhere',title:'Where to next?',subtitle:'Your plans, all in one place.',content:
    card(188,258,'#1a6977')+R(45,208,300,114,'#2f8994',22)+C(274,269,52,'#ffcd83')+T(46,354,'UPCOMING TRIP',11,'#a8e3e4',800)+T(46,395,'Lisbon in spring',27,'#fff',800)+T(46,424,'Apr 12–18  ·  6 days',14,'#c7ece9')+
    T(27,496,'Your itinerary',22,'#12333f',800)+card(516,88)+C(63,560,20,'#e7d3bc')+T(55,567,'✈',19,'#926950')+T(98,552,'Flight to Lisbon',16,'#12333f',700)+T(98,576,'Sat, Apr 12 · 09:35',12,'#81969a')+
    card(616,88)+C(63,660,20,'#d5e7cc')+T(56,667,'⌂',21,'#528451')+T(98,652,'Casa do Sol',16,'#12333f',700)+T(98,676,'Check-in after 15:00',12,'#81969a'),tab:'Home'}),
  'elsewhere-day': shell({bg:'#f0f7f8',ink:'#12333f',accent:'#087e90',brand:'Elsewhere',title:'A day in Lisbon',subtitle:'Monday, April 14  ·  Day 3',content:
    pill(26,185,105,'← Day 2','#dceff0','#087e90')+pill(253,185,110,'Day 4 →','#dceff0','#087e90')+
    [[240,'09:00','Coffee in Alfama','Start the morning slowly','#e5d5be'],[354,'11:30','Tram through the hills','A winding city ride','#f4d6ac'],[468,'14:00','Lunch by the water','Fresh plates and sea air','#c9e7e6'],[582,'17:00','Sunset lookout','Bring your camera','#f1dec7']].map(([y,time,title,sub,color])=>card(y,101)+C(69,y+50,31,color)+T(117,y+28,time,11,'#087e90',800)+T(117,y+55,title,17,'#12333f',700)+T(117,y+77,sub,12,'#81969a')).join(''),tab:'Explore'}),
  'elsewhere-map': shell({bg:'#f0f7f8',ink:'#12333f',accent:'#087e90',brand:'Elsewhere',title:'Explore nearby',subtitle:'Good places, close to you.',content:
    R(24,185,342,393,'#dcecef',24)+`<path d="M30 312 Q110 248 190 303 T365 260 M20 470 Q90 423 181 469 T370 420" fill="none" stroke="#fff" stroke-width="27"/>`+
    `<path d="M95 193 Q130 280 97 376 T142 571 M262 180 Q232 265 280 370 T276 574" fill="none" stroke="#fff" stroke-width="17"/>`+
    [[84,327],[190,289],[290,409],[164,490],[313,260]].map(([x,y])=>C(x,y,14,'#087e90')+C(x,y,5,'#fff')).join('')+
    card(600,117)+C(67,658,29,'#f0cfaa')+T(110,646,'Miradouro lookout',17,'#12333f',800)+T(110,674,'A beautiful view of the city',12,'#81969a'),tab:'Explore'}),
});

const APP = { daily: "daily-arc", savory: "savory", elsewhere: "elsewhere" };
const written = [];
for (const platform of ["iphone", "android-phone"]) for (const locale of ["en", "de"]) {
  cur = { platform, locale };
  for (const [name, svg] of Object.entries(screens())) {
    const file = path.join(root, "examples", APP[name.split("-")[0]], "inputs", platform, locale, `${name}.png`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await sharp(Buffer.from(svg), { density: platform === "iphone" ? 216 : 72 }).png().toFile(file);
    written.push(file);
  }
}
// Review sheet: one row per platform and locale, nine captures each, 260 px wide.
const tiles = await Promise.all(written.map((f) => sharp(f).resize({ width: 260, height: 578, fit: "contain", background: "#ffffff" }).png().toBuffer()));
const sheet = path.join(root, "test/.tmp/example-captures.png");
fs.mkdirSync(path.dirname(sheet), { recursive: true });
await sharp({ create: { width: 9 * 270 + 10, height: 4 * 588 + 10, channels: 3, background: "#d8dadf" } })
  .composite(tiles.map((input, i) => ({ input, left: 10 + (i % 9) * 270, top: 10 + Math.floor(i / 9) * 588 }))).png().toFile(sheet);
console.log(`wrote ${written.length} captures; review sheet ${path.relative(root, sheet)}`);
