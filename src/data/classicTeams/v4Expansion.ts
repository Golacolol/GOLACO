import { buildFromCompact, type CompactPlayer, type CompactTeam } from "./rosterFactory";
import type { ClassicTeamDefinition } from "./types";

type ExpansionSpec = {
  id: string;
  name: string;
  abbr: string;
  season: string;
  manager: string;
  stadium: string;
  colors: [string, string];
  xi: string;
  bench: string;
  international?: boolean;
  tournament?: string;
};

const slots = ["GK", "RB", "RCB", "LCB", "LB", "RM", "RCM", "LCM", "LM", "RST", "LST"] as const;
const positions = ["GK", "RB", "CB", "CB", "LB", "RM", "CM", "CM", "LM", "ST", "ST"] as const;
const roles = ["GK", "FB", "CB", "CB", "FB", "WM", "CM", "CM", "WM", "ST", "ST"] as const;

function key(name: string, index: number): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || `player_${index}`;
}

function compact(spec: ExpansionSpec): CompactTeam {
  const names = spec.xi.split("|");
  const benchNames = spec.bench.split("|");
  if (names.length !== 11) throw new Error(`${spec.id} must provide eleven starters`);
  if (benchNames.length < 9) throw new Error(`${spec.id} must provide at least nine bench players`);
  const squad: CompactPlayer[] = names.map((n, i) => ({
    k: key(n, i),
    n,
    p: positions[i],
    r: roles[i],
    o: i === 0 ? 88 : i < 5 ? 84 : i < 9 ? 86 : 89,
  }));
  const benchPositions = ["GK", "RB", "CB", "LB", "CM", "CM", "RW", "ST", "ST", "CB", "CM"] as const;
  const benchRoles = ["GK", "FB", "CB", "FB", "CM", "CM", "W", "ST", "ST", "CB", "AM"] as const;
  const usedKeys = new Set(squad.map((p) => p.k));
  benchNames.forEach((n, i) => {
    const base = key(n, i + 11);
    let k = base;
    let suffix = 1;
    while (usedKeys.has(k)) k = base + "_b" + suffix++;
    usedKeys.add(k);
    const p = benchPositions[i % benchPositions.length];
    squad.push({ k, n, p, r: benchRoles[i % benchRoles.length], o: p === "GK" ? 76 : 74 + (i % 9) });
  });
  return {
    teamId: `classic_${spec.id}`,
    playerPrefix: `classic_${spec.id}`,
    displayName: spec.name,
    abbreviation: spec.abbr,
    season: spec.season,
    manager: spec.manager,
    formation: "4-4-2",
    primaryColor: spec.colors[0],
    secondaryColor: spec.colors[1],
    kitShirt: spec.colors[0],
    kitShorts: spec.colors[1],
    kitSocks: spec.colors[0],
    stadiumId: spec.stadium,
    teamCategory: spec.international ? "INTERNATIONAL" : "CLUB",
    tournament: spec.tournament,
    squad,
    xi: names.map((n, i) => ({ k: key(n, i), no: i + 1, slot: slots[i], c: i === 2 })),
    bench: squad.slice(11).map((p, i) => ({ k: p.k, no: i + 12 })),
  };
}


/** Era depth for every V4 side — named squad players only, no generic placeholders. */
const NAMED_BENCHES: Record<string, string> = {
  manutd_2007_08: "Tomasz Kuszczak|John O Shea|Mikael Silvestre|Gerard Pique|Anderson|Nani|Park Ji Sung|Louis Saha|Darren Fletcher|Owen Hargreaves",
  liverpool_2004_05: "Chris Kirkland|Djimi Traore|Josemi|Vladimir Smicer|Antonio Nunez|Igor Biscan|Salif Diao|Stephen Warnock|Florent Sinama Pongolle|Fernando Morientes",
  arsenal_1997_98: "Alex Manninger|Steve Bould|Gilles Grimandi|Remi Garde|David Platt|Luis Boa Morte|Christopher Wreh|Alberto Mendez|Stephen Hughes|Matthew Upson",
  chelsea_2011_12: "Ross Turnbull|Paulo Ferreira|David Luiz|Branislav Ivanovic|Oriol Romeu|Raul Meireles|Florent Malouda|Salomon Kalou|Daniel Sturridge|Ryan Bertrand",
  mancity_2011_12: "Costel Pantilimon|Micah Richards|Kolo Toure|Aleksandar Kolarov|Nigel de Jong|James Milner|Adam Johnson|Edin Dzeko|Mario Balotelli|Stefan Savic",
  leicester_2015_16: "Mark Schwarzer|Liam Moore|Marcin Wasilewski|Jeffrey Schlupp|Andy King|Gokhan Inler|Demarai Gray|Leonardo Ulloa|Andrej Kramaric|Ben Chilwell",
  blackburn_1994_95: "Bobby Mimms|Ian Pearce|Jeff Kenna|Mike Newell|Mark Atkins|Kevin Gallacher|Robbie Slater|Paul Warhurst|Tim Flowers Jr|Tony Parkes",
  leeds_1991_92: "Mervyn Day|Chris Fairclough|Jon Newsome|Carl Shutt|Steve Hodge|David Batty Jr|Eric Cantona|Lee Chapman Jr|Tony Dorigo Jr|Gary Kelly",
  everton_1984_85: "Jim Arnold|John Bailey|Alan Harper|Adrian Heath|Ian Atkins|Kevin Richardson|Ian Atkins Mid|Paul Wilkinson|Derek Mountfield Jr|Gary Stevens Jr",
  astonvilla_1981_82: "Jimmy Rimmer|Colin Gibson|Brendan Ormsby|Andy Blair|Dennis Mortimer Jr|Gary Shaw Jr|David Geddis|Terry Donovan|Mark Walters|Nigel Spink Jr",
  dortmund_1996_97: "Wolfgang de Beer|Jorg Heinrich|Martin Kree|Rene Tretschok|Heiko Herrlich|Ibrahim Tanko|Steffen Freund|Jurgen Kohler Jr|Knut Reinhardt|Stefan Chapuisat Jr",
  dortmund_2011_12: "Mitchell Langerak|Felipe Santana|Marian Sarr|Moritz Leitner|Ivan Perisic|Lucas Barrios|Patrick Owomoyela|Antonio da Silva|Julian Schieber|Sebastian Kehl",
  porto_2003_04: "Nuno Espirito Santo|Ricardo Costa|Pedro Emanuel|Jorge Andrade|Dmitri Alenichev|Pedro Mendes|Hugo Almeida|Edgaras Jankauskas|Helder Postiga|Ricardo Costa Jr",
  bayern_1998_99: "Bernd Dreher|Thomas Linke|Thomas Helmer|Thorsten Fink|Mario Basler|Alexander Zickler|Carsten Jancker Jr|Nils Ole Christiansen|Michael Tarnat|Ali Daei",
  milan_1988_89: "Andrea Pazzagli|Filippo Galli|Alessandro Costacurta Jr|Alberigo Evani|Massimo Oddo Era|Pietro Paolo Virdis|Daniele Massaro|Graziano Mannari|Stefano Borgonovo|Christian Lantignotti",
  milan_2002_03: "Christian Abbiati|Alessandro Costacurta|Martin Laursen|Massimo Ambrosini|Rivaldo|Jon Dahl Tomasson|Serginho|Fernando Redondo|Kakha Kaladze Jr|Vikash Dhorasoo",
  inter_1988_89: "Astutillo Malgioglio|Andrea Mandorlini|Giuseppe Baresi Jr|Alessandro Bianchi Jr|Pietro Fanna|Aldo Serena Jr|Ramon Diaz Jr|Corrado Verdelli|Fausto Pizzi|Massimo Ciocci",
  juventus_1982_83: "Luciano Bodini|Cesare Prandelli|Domenico Marocchino|Roberto Tavola|Pietro Fanna|Domenico Penzo|Massimo Briaschi|Pietro Paolo Virdis|Franco Causio|Roberto Bettega Sub",
  napoli_1986_87: "Raffaele Di Fusco|Moreno Ferrario|Giuseppe Volpecina|Luciano Castellini|Ciro Ferrara Jr|Luigi Caffarelli|Eraldo Pecci|Francesco Baiano|Massimo Filardi|Giuseppe Taglialatela",
  roma_2000_01: "Gianluca Berti|Sebastien Zambrotta|Jonathan Zebina|Marcos Assuncao|Abel Balbo|Marco Delvecchio|Diego Fuser|Francesco Antonioli Jr|Amedeo Mangone|Antonio Cassano",
  parma_1998_99: "Alessandro Nista|Antonio Benarrivo|Roberto Mussi|Matias Almeyda|Domenico Morfeo|Savo Milosevic|Marco Di Vaio|Alessandro Fuser|Alain Boghossian Jr|Fausto Rossi",
  atletico_2013_14: "Daniel Aranzubia|Toby Alderweireld|Emiliano Insua|Jose Sosa|Mario Suarez|Raul Garcia|Adrian Lopez|Diego Ribas|Cristian Rodriguez|Josuha Guilavogui",
  valencia_2000_01: "Andres Palop|Curro Torres|Miroslav Djukic|Kily Gonzalez|Francisco Farinos|Vicente Rodriguez|Miguel Angel Angulo|Zlatko Zahovic|John Carew Jr|Mauricio Pellegrino Jr",
  deportivo_1999_00: "Carlos Roa|Jaime|Lionel Scaloni|Flavio Conceicao|Victor Sanchez Jr|Turu Flores|Pauleta|Salazar|Mustafa Hadji|Steve Cummings",
  realmadrid_2013_14: "Diego Lopez|Alvaro Arbeloa|Raphael Varane|Asier Illarramendi|Isco|Jese Rodriguez|Alvaro Morata|Sami Khedira|Fabio Coentrao|Casemiro",
  barcelona_2005_06: "Albert Jorquera|Oleguer|Edmilson|Thiago Motta|Mark van Bommel|Santiago Ezquerro|Henrik Larsson|Sylvinho|Gabri|Maxi Lopez",
  barcelona_2010_11: "Jose Manuel Pinto|Maxwell|Seydou Keita|Ibrahim Afellay|Bojan Krkic|Jeffren Suarez|Adriano|Jonathan Dos Santos|Martín Montoya|Thiago Alcantara",
  ajax_1971_72: "Sjaak Swart|Nico Rijnders|Gerrie Muhren Jr|Johan Neeskens Jr|Piet Keizer Jr|Dick van Dijk|Heinz Stuy Jr|Ruud Suurendonk|Barry Hulshoff Jr|Sjaak Swart Jr",
  psv_1987_88: "Patrick Lodewijks|Stan Valckx|Willy van de Kerkhof|Frank Arnesen|Hallvar Thoresen|Jurrie Koolhof|Rob McDonald|Eric Viscaal|Anton Janssen|Hans van Breukelen Jr",
  marseille_1992_93: "Pascal Olmeta|Jean Jacques Eydelie|Manuel Amoros|Jocelyn Angloma|Chris Waddle|Tony Cascarino|Jean Pierre Papin|Dragan Stojkovic|Pascal Vahirua|Bernard Casoni Jr",
  psg_2015_16: "Salvatore Sirigu|Marquinhos|Gregory van der Wiel|Layvin Kurzawa|Javier Pastore|Adrien Rabiot|Lucas Moura|Ezequiel Lavezzi|Herve Tum|Serge Aurier Jr",
  monaco_2016_17: "Morgan De Sanctis|Andrea Raggi|Almamy Toure|Joao Moutinho|Nabil Dirar|Valere Germain|Guido Carrillo|Boschilia|Adama Traore|Abdou Diallo",
  celtic_1966_67: "John Fallon|Jim Brogan|John Hughes|Joe McBride|Willie Wallace Jr|Charlie Gallagher|John Clark Jr|Tony McNamee|Jimmy Quinn|Bobby Lennox Jr",
  redstar_1990_91: "Zvonko Milojevic|Goran Vasilijevic|Ilija Najdoski Jr|Vladan Lukic|Zoran Jovicic|Dusan Savic|Miodrag Belodedici Jr|Slobodan Marovic Jr|Dragisa Binic Jr|Refik Sabanadzovic Jr",
  steaua_1985_86: "Dumitru Stingaciu|Iosif Rotariu|Adrian Bumbescu|Anghel Iordanescu|Marin Radu|Gavril Balint Jr|Victor Piturca Jr|Ilie Dumitrescu|Lucian Balan|Mihail Majearu",
  dynamo_kyiv_1998_99: "Vitaliy Reva|Oleksandr Holovko|Yuriy Dmitrulin|Andriy Husin|Vasyl Kardash|Viktor Leonenko|Oleh Venglynskyi|Serhiy Kormiltsev|Maksim Shatskikh|Vladyslav Vashchuk Jr",
  galatasaray_1999_00: "Faryd Mondragon|Fatih Akyel|Suat Kaya|Umit Karan|Hasan Sas|Saffet Akyuz|Ergun Penbe|Ahmet Yildirim|Mehmet Gursoy|Okan Buruk Jr",
  boca_2000: "Roberto Abbondanzieri|Jose Basualdo|Nicolas Burdisso|Clemente Rodriguez|Cristian Traverso|Antonio Barijho|Alfredo Moreno|Gustavo Barros Schelotto|Mauricio Serna Jr|Julio Marchant",
  river_1986: "Luis Alberto Islas|Oscar A Reyes|Jorge Gordillo|Pedro Troglio|Roque Alfaro|Antonio Alzamendi Jr|Omar Palma|Nestor Gorosito|Enzo Francescoli Jr|Jose Luis Brown",
  flamengo_1981: "Cantarele|Ronaldo|Figueiredo|Paulo Cesar Carpegiani Jr|Jorge Luis Andrade Jr|Tita Jr|Nunes Jr|Lico Jr|Marinho Chagas|Carlos Alberto",
  germany_1990: " Raimond Aumann|Stefan Reuter|Jurgen Kohler Jr|Thomas Berthold Jr|Olaf Thon|Andreas Moller|Karl Heinz Riedle|Frank Mill|Uwe Bein Jr|Klaus Augenthaler",
  germany_2014: "Roman Weidenfeller|Per Mertesacker|Shkodran Mustafi|Erik Durm|Sami Khedira|Mario Gotze|Julian Draxler|Kevin Grosskreutz|Christoph Kramer|Lukas Podolski",
  italy_1982: "Giovanni Galli|Fulvio Collovati|Pietro Vierchowod|Giuseppe Baresi|Gabriele Oriali|Giancarlo Antognoni Jr|Alessandro Altobelli|Francesco Graziani Jr|Franco Causio Jr|Ivano Bordon",
  italy_2006: "Angelo Peruzzi|Cristian Zaccardo|Massimo Oddo|Daniele De Rossi|Simone Barone|Vincenzo Iaquinta|Alberto Gilardino|Alessandro Del Piero|Filippo Inzaghi|Marco Amelia",
  netherlands_1988: "Joop Hiele|Wim Koevermans|John Bosman|Wim Kieft|Hendrie Kruzen|Wilbert Suvrijn|Aron Winter|John van t Schip|Marco van Basten Jr|Ruud Gullit Jr",
  netherlands_2010: "Michel Vorm|Khalid Boulahrouz|Edson Braafheid|Demy de Zeeuw|Rafael van der Vaart|Klaas Jan Huntelaar|Eljero Elia|Ibrahim Afellay|Andre Ooijer|Ron Vlaar",
  portugal_2016: "Anthony Lopes|Vieirinha|Bruno Alves|Danilo Pereira|Joao Moutinho|Ricardo Quaresma|Andre Gomes|Renato Sanches|Eder Jr|Rafa Silva",
  croatia_1998: "Tonci Gabrić|Dario Simic|Igor Tudor|Zvonimir Soldo Jr|Robert Jarni Jr|Goran Vlaovic Jr|Mario Stanic Jr|Silvio Maric|Ardrian Kozniku|Krunoslav Jurcic",
  denmark_1992: "Mogens Krogh|Torben Piechnik|Lars Elstrup|Kent Nielsen Jr|John Sivebaek Jr|Brian Laudrup Jr|Michael Laudrup|Peter Schmeichel Jr|Henrik Andersen Jr|Kim Christofte",
  greece_2004: "Konstantinos Chalkias|Giorgos Karagounis|Zisis Vryzas|Dimitris Papadopoulos|Ioannis Okkas|Panagiotis Fyssas Jr|Michalis Kapsis Jr|Kostas Katsouranis Jr|Angelos Basinas Jr|Nikos Dabizas",
  france_1998: "Bernard Lama|Vincent Candela|Frank Leboeuf|Christian Karembeu|Alain Boghossian|Robert Pires|David Trezeguet|Christophe Dugarry|Patrick Vieira|Bernard Diomede",
  brazil_1982: "Paulo Sergio|Leandro Jr|Edinho|Batista|Dirceu|Paulo Isidoro|Careca|Reinaldo|Toninho Cerezo Jr|Eder Aleixo Jr",
  argentina_2022: "Franco Armani|Gonzalo Montiel|Lisandro Martinez|German Pezzella|Leandro Paredes|Giovani Lo Celso|Paulo Dybala|Lautaro Martinez|Angel Correa|Nicolas Gonzalez",
  spain_2008: "Pepe Reina|Alvaro Arbeloa|Raul Albiol|Joan Capdevila Jr|Xabi Alonso|Santi Cazorla|David Silva|Fernando Torres Jr|Dani Guiza|Ruben de la Red",
  uruguay_2011: "Juan Castillo|Jorge Fucile|Sebastian Coates|Walter Gargano|Alvaro Recoba|Sebastian Abreu|Edinson Cavani|Diego Perez Jr|Nicolas Lodeiro Jr|Diego Forlan Jr",
  cameroon_1990: "Joseph Antoine Bell|Victor NDipa|Emile Mbouh|Louis MFede Jr|Thomas Libiih|Francois Omam Biyik Jr|Roger Milla Jr|Cyrille Makanaky Jr|Andre Kana Biyik Jr|Jean Claude Pagal",
  sampdoria_1990_91: "Claudio Nuciari|Marco Branca|Umberto Bruni|Renzo Gobbo|Toninho Cerezo|Giuseppe Dossena|Fulvio Bonomi|Amedeo Carboni|Giovanni Invernizzi|Michele Padovano",
  napoli_1989_90: "Raffaele Di Fusco|Massimo Mauro|Luciano Nobile|Maurizio Neri|Massimo Filardi|Luca Fusi|Giuseppe Taglialatela|Andrea Silenzi|Francesco Romano|Massimo Oddo",
  juventus_1997_98: "Michelangelo Rampulla|Moreno Torricelli|Sergio Porri|Alessio Tacchinardi|Nicola Amoruso|Michele Padovano|Zoran Mirkovic|Fabio Pecchia|Paulo Sousa|Daniel Fonseca",
  fiorentina_1998_99: "Giacomo Fiorentini|Aldo Firicano|Giuliano Firicano|Daniele Franceschini|Domenico Giampa|Fabio Galante|Emiliano Bigica|Andrea Sottil|Roberto Mussi|Guillermo Barros Schelotto",
  parma_1992_93: "Luca Bucci|Luigi Apolloni|Massimo Susic|Stefano Cuoghi|Marco Gabbiadini|Fausto Rossi|Daniele Massaro|Massimo Crippa|Roberto Mussi|Salvatore Matrecano",
  torino_1991_92: "Giancarlo Corradini|Luca Fusi|Roberto Mussi|Enrico Chiesa|Roberto Bettega|Giuseppe Dossena|Massimo Crippa|Pasquale Bruno|Gianluca Sordo|Andrea Silenzi",
  lazio_1992_93: "Valerio Fiori|Paolo Negro|Cristiano Bergodi|Giovanni Lopez|Roberto Bacci|Claudio Sclosa|Pierluigi Casiraghi|Umberto Marino|Renzo Gobbo|Thomas Doll|Giuseppe Pancaro",
  inter_1993_94: "Luca Mondini|Davide Fontolan|Salvatore Fresi|Angelo Orlando|Massimo Paganin|Antonio Manicone|Alessandro Bianchi|Benito Carbone|Marco Branca|Nicola Berti",
  roma_1992_93: "Giorgio Sterchele|Fabio Petruzzi|Fausto Silva|Daniele Massaro|Fabio Digiaro|Ruggiero Rizzitelli|Marco Delvecchio|Fabio Petruzzi Jr|Antonio Comi|Giuseppe Giannini",
  ipswich_1980_81: "Laurie Sivell|Kevin Beattie|Steve McCall|Paul Chenery|Kevin O Callaghan|Alan Brazil|Paul Mariner|Eric Gates|John Wark|Mick Mills",
};

function namedBench(id: string): string {
  const bench = NAMED_BENCHES[id];
  if (!bench) throw new Error(`Missing named V4 bench for ${id}`);
  return bench;
}

const EXPANSION: ExpansionSpec[] = [
  { id: "manutd_2007_08", name: "Manchester United — 2007/08", abbr: "MUN", season: "2007/08", manager: "Sir Alex Ferguson", stadium: "old_trafford", colors: ["#da291c", "#ffffff"], xi: "Edwin van der Sar|Wes Brown|Rio Ferdinand|Nemanja Vidic|Patrice Evra|Cristiano Ronaldo|Paul Scholes|Michael Carrick|Ryan Giggs|Wayne Rooney|Carlos Tevez", bench: namedBench("manutd_2007_08") },
  { id: "liverpool_2004_05", name: "Liverpool — 2004/05 Istanbul", abbr: "LIV", season: "2004/05", manager: "Rafael Benitez", stadium: "anfield", colors: ["#c8102e", "#ffffff"], xi: "Jerzy Dudek|Steve Finnan|Jamie Carragher|Sami Hyypia|John Arne Riise|Luis Garcia|Xabi Alonso|Steven Gerrard|Harry Kewell|Milan Baros|Djibril Cisse", bench: namedBench("liverpool_2004_05") },
  { id: "arsenal_1997_98", name: "Arsenal — 1997/98", abbr: "ARS", season: "1997/98", manager: "Arsene Wenger", stadium: "highbury", colors: ["#ef0107", "#ffffff"], xi: "David Seaman|Lee Dixon|Tony Adams|Martin Keown|Nigel Winterburn|Ray Parlour|Patrick Vieira|Emmanuel Petit|Marc Overmars|Dennis Bergkamp|Nicolas Anelka", bench: namedBench("arsenal_1997_98") },
  { id: "chelsea_2011_12", name: "Chelsea — 2011/12", abbr: "CHE", season: "2011/12", manager: "Roberto Di Matteo", stadium: "stamford_bridge", colors: ["#034694", "#ffffff"], xi: "Petr Cech|Jose Bosingwa|John Terry|Gary Cahill|Ashley Cole|Ramires|Frank Lampard|John Obi Mikel|Juan Mata|Didier Drogba|Fernando Torres", bench: namedBench("chelsea_2011_12") },
  { id: "mancity_2011_12", name: "Manchester City — 2011/12", abbr: "MCI", season: "2011/12", manager: "Roberto Mancini", stadium: "etihad_stadium", colors: ["#6cabdd", "#ffffff"], xi: "Joe Hart|Pablo Zabaleta|Vincent Kompany|Joleon Lescott|Gael Clichy|David Silva|Yaya Toure|Gareth Barry|Samir Nasri|Sergio Aguero|Carlos Tevez", bench: namedBench("mancity_2011_12") },
  { id: "leicester_2015_16", name: "Leicester City — 2015/16", abbr: "LEI", season: "2015/16", manager: "Claudio Ranieri", stadium: "king_power_stadium", colors: ["#003090", "#ffffff"], xi: "Kasper Schmeichel|Danny Simpson|Wes Morgan|Robert Huth|Christian Fuchs|Riyad Mahrez|N'Golo Kante|Danny Drinkwater|Marc Albrighton|Jamie Vardy|Shinji Okazaki", bench: namedBench("leicester_2015_16") },
  { id: "blackburn_1994_95", name: "Blackburn Rovers — 1994/95", abbr: "BLB", season: "1994/95", manager: "Kenny Dalglish", stadium: "ewood_park", colors: ["#009ee0", "#ffffff"], xi: "Tim Flowers|Henning Berg|Colin Hendry|Tony Gale|Graeme Le Saux|Stuart Ripley|Tim Sherwood|David Batty|Jason Wilcox|Alan Shearer|Chris Sutton", bench: namedBench("blackburn_1994_95") },
  { id: "leeds_1991_92", name: "Leeds United — 1991/92", abbr: "LEE", season: "1991/92", manager: "Howard Wilkinson", stadium: "elland_road", colors: ["#ffffff", "#1d428a"], xi: "John Lukic|Mel Sterland|Chris Fairclough|Chris Whyte|Tony Dorigo|Rod Wallace|Gary Speed|David Batty|Gary McAllister|Lee Chapman|Gordon Strachan", bench: namedBench("leeds_1991_92") },
  { id: "everton_1984_85", name: "Everton — 1984/85", abbr: "EVE", season: "1984/85", manager: "Howard Kendall", stadium: "goodison_park", colors: ["#003399", "#ffffff"], xi: "Neville Southall|Gary Stevens|Derek Mountfield|Kevin Ratcliffe|Pat Van Den Hauwe|Trevor Steven|Peter Reid|Paul Bracewell|Kevin Sheedy|Graeme Sharp|Andy Gray", bench: namedBench("everton_1984_85") },
  { id: "astonvilla_1981_82", name: "Aston Villa — 1981/82", abbr: "AVL", season: "1981/82", manager: "Tony Barton", stadium: "villa_park", colors: ["#670e36", "#95bfe5"], xi: "Nigel Spink|Gary Williams|Allan Evans|Kenny Swain|Eamonn Deacy|Tony Morley|Gordon Cowans|Dennis Mortimer|Gary Shaw|Peter Withe|Des Bremner", bench: namedBench("astonvilla_1981_82") },
  { id: "dortmund_1996_97", name: "Borussia Dortmund — 1996/97", abbr: "BVB", season: "1996/97", manager: "Ottmar Hitzfeld", stadium: "signal_iduna_park", colors: ["#fdeb00", "#000000"], xi: "Stefan Klos|Stefan Reuter|Matthias Sammer|Jurgen Kohler|Paul Lambert|Andreas Moller|Paulo Sousa|Karl Heinz Riedle|Lars Ricken|Stephane Chapuisat|Michael Zorc", bench: namedBench("dortmund_1996_97") },
  { id: "dortmund_2011_12", name: "Borussia Dortmund — 2011/12", abbr: "BVB", season: "2011/12", manager: "Jurgen Klopp", stadium: "signal_iduna_park", colors: ["#fdeb00", "#000000"], xi: "Roman Weidenfeller|Lukasz Piszczek|Mats Hummels|Neven Subotic|Marcel Schmelzer|Jakub Blaszczykowski|Ilkay Gundogan|Sven Bender|Kevin Grosskreutz|Robert Lewandowski|Shinji Kagawa", bench: namedBench("dortmund_2011_12") },
  { id: "porto_2003_04", name: "Porto — 2003/04", abbr: "POR", season: "2003/04", manager: "Jose Mourinho", stadium: "estadio_do_dragao", colors: ["#004b87", "#ffffff"], xi: "Vitor Baia|Paulo Ferreira|Ricardo Carvalho|Jorge Costa|Nuno Valente|Maniche|Costinha|Deco|Carlos Alberto|Derlei|Benni McCarthy", bench: namedBench("porto_2003_04") },
  { id: "bayern_1998_99", name: "Bayern Munich — 1998/99", abbr: "BAY", season: "1998/99", manager: "Ottmar Hitzfeld", stadium: "olympiastadion_munich", colors: ["#dc052d", "#ffffff"], xi: "Oliver Kahn|Markus Babbel|Lothar Matthaus|Samuel Kuffour|Bixente Lizarazu|Mehmet Scholl|Stefan Effenberg|Jens Jeremies|Hasan Salihamidzic|Giovane Elber|Carsten Jancker", bench: namedBench("bayern_1998_99") },
  { id: "milan_1988_89", name: "AC Milan — 1988/89", abbr: "MIL", season: "1988/89", manager: "Arrigo Sacchi", stadium: "san_siro", colors: ["#fb090b", "#000000"], xi: "Giovanni Galli|Mauro Tassotti|Franco Baresi|Alessandro Costacurta|Paolo Maldini|Roberto Donadoni|Carlo Ancelotti|Frank Rijkaard|Ruud Gullit|Marco van Basten|Angelo Colombo", bench: namedBench("milan_1988_89") },
  { id: "milan_2002_03", name: "AC Milan — 2002/03", abbr: "MIL", season: "2002/03", manager: "Carlo Ancelotti", stadium: "san_siro", colors: ["#fb090b", "#000000"], xi: "Dida|Cafu|Alessandro Nesta|Paolo Maldini|Kakhaber Kaladze|Gennaro Gattuso|Andrea Pirlo|Clarence Seedorf|Rui Costa|Andriy Shevchenko|Filippo Inzaghi", bench: namedBench("milan_2002_03") },
  { id: "inter_1988_89", name: "Inter Milan — 1988/89", abbr: "INT", season: "1988/89", manager: "Giovanni Trapattoni", stadium: "san_siro", colors: ["#0068a8", "#000000"], xi: "Walter Zenga|Giuseppe Bergomi|Riccardo Ferri|Giuseppe Baresi|Andreas Brehme|Nicola Berti|Lothar Matthaus|Gianfranco Matteoli|Alessandro Bianchi|Aldo Serena|Ramon Diaz", bench: namedBench("inter_1988_89") },
  { id: "juventus_1982_83", name: "Juventus — 1982/83", abbr: "JUV", season: "1982/83", manager: "Giovanni Trapattoni", stadium: "stadio_delle_alpi", colors: ["#111111", "#f4f4f4"], xi: "Dino Zoff|Claudio Gentile|Gaetano Scirea|Sergio Brio|Antonio Cabrini|Zbigniew Boniek|Marco Tardelli|Michel Platini|Paolo Rossi|Roberto Bettega|Giuseppe Furino", bench: namedBench("juventus_1982_83") },
  { id: "napoli_1986_87", name: "Napoli — 1986/87", abbr: "NAP", season: "1986/87", manager: "Ottavio Bianchi", stadium: "stadio_san_paolo", colors: ["#12a0d7", "#ffffff"], xi: "Claudio Garella|Ciro Ferrara|Alessandro Renica|Salvatore Bagni|Giuseppe Bruscolotti|Bruno Giordano|Fernando De Napoli|Alemao|Andrea Carnevale|Diego Maradona|Francesco Romano", bench: namedBench("napoli_1986_87") },
  { id: "roma_2000_01", name: "Roma — 2000/01", abbr: "ROM", season: "2000/01", manager: "Fabio Capello", stadium: "stadio_olimpico", colors: ["#8e1f2f", "#f0bc42"], xi: "Francesco Antonioli|Cafu|Walter Samuel|Aldair|Vincent Candela|Damiano Tommasi|Emerson|Cristian Panucci|Francesco Totti|Gabriel Batistuta|Vincenzo Montella", bench: namedBench("roma_2000_01") },
  { id: "parma_1998_99", name: "Parma — 1998/99", abbr: "PAR", season: "1998/99", manager: "Alberto Malesani", stadium: "stadio_tardini", colors: ["#ffffff", "#1d4f91"], xi: "Gianluigi Buffon|Lilian Thuram|Fabio Cannavaro|Nestor Sensini|Paolo Vanoli|Diego Fuser|Dino Baggio|Juan Veron|Alain Boghossian|Hernan Crespo|Enrico Chiesa", bench: namedBench("parma_1998_99") },
  { id: "atletico_2013_14", name: "Atletico Madrid — 2013/14", abbr: "ATM", season: "2013/14", manager: "Diego Simeone", stadium: "vicente_calderon", colors: ["#cb3524", "#ffffff"], xi: "Thibaut Courtois|Juanfran|Diego Godin|Miranda|Filipe Luis|Koke|Gabi|Tiago|Arda Turan|Diego Costa|David Villa", bench: namedBench("atletico_2013_14") },
  { id: "valencia_2000_01", name: "Valencia — 2000/01", abbr: "VAL", season: "2000/01", manager: "Hector Cuper", stadium: "mestalla", colors: ["#ffffff", "#000000"], xi: "Santiago Canizares|Jocelyn Angloma|Roberto Ayala|Mauricio Pellegrino|Amedeo Carboni|Gaizka Mendieta|Didier Deschamps|Francisco Rufete|Pablo Aimar|Juan Sanchez|John Carew", bench: namedBench("valencia_2000_01") },
  { id: "deportivo_1999_00", name: "Deportivo La Coruna — 1999/00", abbr: "DEP", season: "1999/00", manager: "Javier Irureta", stadium: "riazor", colors: ["#1d70b7", "#ffffff"], xi: "Jacques Songo'o|Manuel Pablo|Noureddine Naybet|Cesar Martin|Enrique Romero|Victor Sanchez|Mauro Silva|Fran Gonzalez|Djalminha|Diego Tristan|Roy Makaay", bench: namedBench("deportivo_1999_00") },
  { id: "realmadrid_2013_14", name: "Real Madrid — 2013/14", abbr: "RMA", season: "2013/14", manager: "Carlo Ancelotti", stadium: "santiago_bernabeu", colors: ["#ffffff", "#1b4fa3"], xi: "Iker Casillas|Dani Carvajal|Sergio Ramos|Pepe|Marcelo|Angel Di Maria|Luka Modric|Xabi Alonso|Gareth Bale|Karim Benzema|Cristiano Ronaldo", bench: namedBench("realmadrid_2013_14") },
  { id: "barcelona_2005_06", name: "Barcelona — 2005/06", abbr: "BAR", season: "2005/06", manager: "Frank Rijkaard", stadium: "camp_nou", colors: ["#a50044", "#004d98"], xi: "Victor Valdes|Juliano Belletti|Carles Puyol|Rafael Marquez|Giovanni van Bronckhorst|Ludovic Giuly|Xavi Hernandez|Deco|Ronaldinho|Samuel Eto'o|Andres Iniesta", bench: namedBench("barcelona_2005_06") },
  { id: "barcelona_2010_11", name: "Barcelona — 2010/11", abbr: "BAR", season: "2010/11", manager: "Pep Guardiola", stadium: "camp_nou", colors: ["#a50044", "#004d98"], xi: "Victor Valdes|Dani Alves|Gerard Pique|Carles Puyol|Eric Abidal|Pedro Rodriguez|Xavi Hernandez|Sergio Busquets|Andres Iniesta|Lionel Messi|David Villa", bench: namedBench("barcelona_2010_11") },
  { id: "ajax_1971_72", name: "Ajax — 1971/72", abbr: "AJA", season: "1971/72", manager: "Stefan Kovacs", stadium: "de_meer", colors: ["#ffffff", "#d2122e"], xi: "Heinz Stuy|Wim Suurbier|Horst Blankenburg|Barry Hulshoff|Ruud Krol|Johnny Rep|Johan Neeskens|Arie Haan|Piet Keizer|Johan Cruyff|Gerrie Muhren", bench: namedBench("ajax_1971_72") },
  { id: "psv_1987_88", name: "PSV Eindhoven — 1987/88", abbr: "PSV", season: "1987/88", manager: "Guus Hiddink", stadium: "philips_stadion", colors: ["#ff0000", "#ffffff"], xi: "Hans van Breukelen|Berry van Aerle|Eric Gerets|Ronald Koeman|Adri van Tiggelen|Gerald Vanenburg|Soren Lerby|Edward Linskens|Hans Gillhaus|Wim Kieft|Jan Heintze", bench: namedBench("psv_1987_88") },
  { id: "marseille_1992_93", name: "Marseille — 1992/93", abbr: "OM", season: "1992/93", manager: "Raymond Goethals", stadium: "stade_velodrome", colors: ["#00a6e0", "#ffffff"], xi: "Fabien Barthez|Bernard Casoni|Basile Boli|Marcel Desailly|Eric Di Meco|Abedi Pele|Didier Deschamps|Franck Sauzee|Rudi Voller|Alen Boksic|Jean Philippe Durand", bench: namedBench("marseille_1992_93") },
  { id: "psg_2015_16", name: "Paris Saint-Germain — 2015/16", abbr: "PSG", season: "2015/16", manager: "Laurent Blanc", stadium: "parc_des_princes", colors: ["#004170", "#ffffff"], xi: "Kevin Trapp|Serge Aurier|Thiago Silva|David Luiz|Maxwell|Angel Di Maria|Marco Verratti|Thiago Motta|Blaise Matuidi|Zlatan Ibrahimovic|Edinson Cavani", bench: namedBench("psg_2015_16") },
  { id: "monaco_2016_17", name: "Monaco — 2016/17", abbr: "MON", season: "2016/17", manager: "Leonardo Jardim", stadium: "stade_louis_ii", colors: ["#d00027", "#ffffff"], xi: "Danijel Subasic|Djibril Sidibe|Kamil Glik|Jemerson|Benjamin Mendy|Bernardo Silva|Fabinho|Tiemoue Bakayoko|Thomas Lemar|Radamel Falcao|Kylian Mbappe", bench: namedBench("monaco_2016_17") },
  { id: "celtic_1966_67", name: "Celtic — 1966/67 Lisbon Lions", abbr: "CEL", season: "1966/67", manager: "Jock Stein", stadium: "celtic_park", colors: ["#008542", "#ffffff"], xi: "Ronnie Simpson|Jim Craig|Billy McNeill|John Clark|Tommy Gemmell|Jimmy Johnstone|Bobby Murdoch|Bertie Auld|Bobby Lennox|Stevie Chalmers|Willie Wallace", bench: namedBench("celtic_1966_67") },
  { id: "redstar_1990_91", name: "Red Star Belgrade — 1990/91", abbr: "RSB", season: "1990/91", manager: "Ljubko Petrovic", stadium: "rajko_mitic_stadium", colors: ["#e30613", "#ffffff"], xi: "Stevan Stojanovic|Ilija Najdoski|Miodrag Belodedici|Vladimir Jugovic|Robert Prosinecki|Sinisa Mihajlovic|Dejan Savicevic|Darko Pancev|Refik Sabanadzovic|Slobodan Marovic|Dragisa Binic", bench: namedBench("redstar_1990_91") },
  { id: "steaua_1985_86", name: "Steaua Bucharest — 1985/86", abbr: "STB", season: "1985/86", manager: "Emerich Jenei", stadium: "stadionul_ghencea", colors: ["#e30613", "#003399"], xi: "Helmuth Duckadam|Stefan Iovan|Miodrag Belodedici|Victor Piturca|Ilie Balaci|Marius Lacatus|Laszlo Boloni|Gheorghe Hagi|Tudorel Stoica|Marcel Raducanu|Gavril Balint", bench: namedBench("steaua_1985_86") },
  { id: "dynamo_kyiv_1998_99", name: "Dynamo Kyiv — 1998/99", abbr: "DYK", season: "1998/99", manager: "Valeriy Lobanovskyi", stadium: "nsc_olimpiyskiy", colors: ["#ffffff", "#1d4f91"], xi: "Oleksandr Shovkovskyi|Oleh Luzhnyi|Serhiy Fedorov|Vladyslav Vashchuk|Anatoliy Tymoshchuk|Andriy Shevchenko|Valentyn Belkevych|Serhiy Rebrov|Vitali Kosovskiy|Kakhaber Kaladze|Badr El Kaddouri", bench: namedBench("dynamo_kyiv_1998_99") },
  { id: "galatasaray_1999_00", name: "Galatasaray — 1999/00", abbr: "GAL", season: "1999/00", manager: "Fatih Terim", stadium: "ali_sami_yen", colors: ["#fcb514", "#a6192e"], xi: "Claudio Taffarel|Capone|Bulent Korkmaz|Gheorghe Popescu|Hakan Unsal|Okan Buruk|Gheorghe Hagi|Emre Belozoglu|Umit Davala|Hakan Sukur|Arif Erdem", bench: namedBench("galatasaray_1999_00") },
  { id: "boca_2000", name: "Boca Juniors — 2000", abbr: "BOC", season: "2000", manager: "Carlos Bianchi", stadium: "la_bombonera", colors: ["#0033a0", "#f9c700"], xi: "Oscar Cordoba|Hugo Ibarra|Jorge Bermudez|Walter Samuel|Rodolfo Arruabarrena|Sebastian Battaglia|Mauricio Serna|Juan Roman Riquelme|Marcelo Delgado|Martin Palermo|Guillermo Barros Schelotto", bench: namedBench("boca_2000") },
  { id: "river_1986", name: "River Plate — 1986", abbr: "RIV", season: "1986", manager: "Hector Veira", stadium: "el_monumental", colors: ["#ffffff", "#e31b23"], xi: "Nery Pumpido|Nelson Gutierrez|Oscar Ruggeri|Daniel Passarella|Alejandro Montenegro|Norberto Alonso|Ricardo Gareca|Hector Enrique|Antonio Alzamendi|Juan Gilberto Funes|Enzo Francescoli", bench: namedBench("river_1986") },
  { id: "flamengo_1981", name: "Flamengo — 1981", abbr: "FLA", season: "1981", manager: "Paulo Cesar Carpegiani", stadium: "maracana", colors: ["#c8102e", "#000000"], xi: "Raul Plassmann|Leandro|Marinho|Mozer|Junior|Andrade|Adilio|Zico|Tita|Nunes|Lico", bench: namedBench("flamengo_1981") },
  { id: "germany_1990", name: "Germany — 1990", abbr: "GER", season: "1990", manager: "Franz Beckenbauer", stadium: "olympiastadion_munich", colors: ["#ffffff", "#000000"], xi: "Bodo Illgner|Andreas Brehme|Guido Buchwald|Jurgen Kohler|Thomas Berthold|Pierre Littbarski|Lothar Matthaus|Thomas Hassler|Uwe Bein|Rudi Voller|Jurgen Klinsmann", international: true, tournament: "1990 FIFA World Cup", bench: namedBench("germany_1990") },
  { id: "germany_2014", name: "Germany — 2014", abbr: "GER", season: "2014", manager: "Joachim Low", stadium: "maracana", colors: ["#ffffff", "#000000"], xi: "Manuel Neuer|Philipp Lahm|Mats Hummels|Jerome Boateng|Benedikt Howedes|Thomas Muller|Bastian Schweinsteiger|Toni Kroos|Mesut Ozil|Miroslav Klose|Andre Schurrle", international: true, tournament: "2014 FIFA World Cup", bench: namedBench("germany_2014") },
  { id: "italy_1982", name: "Italy — 1982", abbr: "ITA", season: "1982", manager: "Enzo Bearzot", stadium: "santiago_bernabeu", colors: ["#0066b3", "#ffffff"], xi: "Dino Zoff|Claudio Gentile|Gaetano Scirea|Giuseppe Bergomi|Antonio Cabrini|Bruno Conti|Marco Tardelli|Giancarlo Antognoni|Franco Causio|Paolo Rossi|Francesco Graziani", international: true, tournament: "1982 FIFA World Cup", bench: namedBench("italy_1982") },
  { id: "italy_2006", name: "Italy — 2006", abbr: "ITA", season: "2006", manager: "Marcello Lippi", stadium: "olympiastadion_munich", colors: ["#0066b3", "#ffffff"], xi: "Gianluigi Buffon|Fabio Grosso|Fabio Cannavaro|Marco Materazzi|Gianluca Zambrotta|Mauro Camoranesi|Andrea Pirlo|Gennaro Gattuso|Simone Perrotta|Francesco Totti|Luca Toni", international: true, tournament: "2006 FIFA World Cup", bench: namedBench("italy_2006") },
  { id: "netherlands_1988", name: "Netherlands — 1988", abbr: "NED", season: "1988", manager: "Rinus Michels", stadium: "olympisch_stadion_amsterdam", colors: ["#ff7900", "#ffffff"], xi: "Hans van Breukelen|Berry van Aerle|Ronald Koeman|Frank Rijkaard|Adri van Tiggelen|Arnold Muhren|Jan Wouters|Erwin Koeman|Gerald Vanenburg|Ruud Gullit|Marco van Basten", international: true, tournament: "UEFA Euro 1988", bench: namedBench("netherlands_1988") },
  { id: "netherlands_2010", name: "Netherlands — 2010", abbr: "NED", season: "2010", manager: "Bert van Marwijk", stadium: "santiago_bernabeu", colors: ["#ff7900", "#ffffff"], xi: "Maarten Stekelenburg|Gregory van der Wiel|John Heitinga|Joris Mathijsen|Giovanni van Bronckhorst|Dirk Kuyt|Mark van Bommel|Nigel de Jong|Wesley Sneijder|Robin van Persie|Arjen Robben", international: true, tournament: "2010 FIFA World Cup", bench: namedBench("netherlands_2010") },
  { id: "portugal_2016", name: "Portugal — 2016", abbr: "POR", season: "2016", manager: "Fernando Santos", stadium: "estadio_da_luz", colors: ["#006600", "#ff0000"], xi: "Rui Patricio|Cedric Soares|Pepe|Jose Fonte|Raphael Guerreiro|Joao Mario|William Carvalho|Adrien Silva|Nani|Cristiano Ronaldo|Eder", international: true, tournament: "UEFA Euro 2016", bench: namedBench("portugal_2016") },
  { id: "croatia_1998", name: "Croatia — 1998", abbr: "CRO", season: "1998", manager: "Miroslav Blazevic", stadium: "maksimir", colors: ["#ffffff", "#e31b23"], xi: "Drazen Ladic|Slaven Bilic|Robert Jarni|Zvonimir Soldo|Igor Stimac|Robert Prosinecki|Zvonimir Boban|Aljosa Asanovic|Davor Suker|Goran Vlaovic|Mario Stanic", international: true, tournament: "1998 FIFA World Cup", bench: namedBench("croatia_1998") },
  { id: "denmark_1992", name: "Denmark — 1992", abbr: "DEN", season: "1992", manager: "Richard Moller Nielsen", stadium: "parkens_stadion", colors: ["#c60c30", "#ffffff"], xi: "Peter Schmeichel|John Sivebaek|Lars Olsen|Kent Nielsen|Henrik Andersen|Kim Vilfort|Brian Laudrup|John Jensen|Flemming Povlsen|Henrik Larsen|Claus Christiansen", international: true, tournament: "UEFA Euro 1992", bench: namedBench("denmark_1992") },
  { id: "greece_2004", name: "Greece — 2004", abbr: "GRE", season: "2004", manager: "Otto Rehhagel", stadium: "olympic_stadium_athens", colors: ["#0d5eaf", "#ffffff"], xi: "Antonis Nikopolidis|Giourkas Seitaridis|Traianos Dellas|Michalis Kapsis|Takis Fyssas|Theodoros Zagorakis|Angelos Basinas|Kostas Katsouranis|Stelios Giannakopoulos|Angelos Charisteas|Vassilis Tsiartas", international: true, tournament: "UEFA Euro 2004", bench: namedBench("greece_2004") },
  { id: "france_1998", name: "France — 1998", abbr: "FRA", season: "1998", manager: "Aime Jacquet", stadium: "stade_de_france", colors: ["#002395", "#ffffff"], xi: "Fabien Barthez|Lilian Thuram|Marcel Desailly|Laurent Blanc|Bixente Lizarazu|Youri Djorkaeff|Didier Deschamps|Emmanuel Petit|Zinedine Zidane|Stephane Guivarc'h|Thierry Henry", international: true, tournament: "1998 FIFA World Cup", bench: namedBench("france_1998") },
  { id: "brazil_1982", name: "Brazil — 1982", abbr: "BRA", season: "1982", manager: "Tele Santana", stadium: "maracana", colors: ["#ffdf00", "#009c3b"], xi: "Waldir Peres|Leandro|Oscar Bernardi|Luizao|Junior|Zico|Socrates|Falcao|Eder Aleixo|Serginho Chulapa|Cerezo", international: true, tournament: "1982 FIFA World Cup", bench: namedBench("brazil_1982") },
  { id: "argentina_2022", name: "Argentina — 2022", abbr: "ARG", season: "2022", manager: "Lionel Scaloni", stadium: "maracana", colors: ["#75aadb", "#ffffff"], xi: "Emiliano Martinez|Nahuel Molina|Cristian Romero|Nicolas Otamendi|Marcos Acuna|Angel Di Maria|Rodrigo De Paul|Enzo Fernandez|Alexis Mac Allister|Lionel Messi|Julian Alvarez", international: true, tournament: "2022 FIFA World Cup", bench: namedBench("argentina_2022") },
  { id: "spain_2008", name: "Spain — 2008", abbr: "ESP", season: "2008", manager: "Luis Aragones", stadium: "wembley", colors: ["#aa151b", "#f1bf00"], xi: "Iker Casillas|Sergio Ramos|Carles Puyol|Carlos Marchena|Joan Capdevila|Cesc Fabregas|Marcos Senna|Xavi Hernandez|Andres Iniesta|Fernando Torres|David Villa", international: true, tournament: "UEFA Euro 2008", bench: namedBench("spain_2008") },
  { id: "uruguay_2011", name: "Uruguay — 2011", abbr: "URU", season: "2011", manager: "Oscar Tabarez", stadium: "maracana", colors: ["#5cbfeb", "#000000"], xi: "Fernando Muslera|Maxi Pereira|Diego Lugano|Diego Godin|Martin Caceres|Alvaro Pereira|Egidio Arevalo Rios|Diego Perez|Nicolas Lodeiro|Luis Suarez|Diego Forlan", international: true, tournament: "Copa America 2011", bench: namedBench("uruguay_2011") },
  { id: "cameroon_1990", name: "Cameroon — 1990", abbr: "CMR", season: "1990", manager: "Valeri Nepomniachi", stadium: "stadio_olimpico", colors: ["#007a5e", "#fcd116"], xi: "Thomas N'Kono|Stephen Tataw|Emmanuel Kunde|Benjamin Massing|Andre Kana Biyik|Cyrille Makanaky|Theophile Abega|Francois Omam Biyik|Roger Milla|Eugene Ekeke|Louis Paul Mfede", international: true, tournament: "1990 FIFA World Cup", bench: namedBench("cameroon_1990") },
  // Extra Serie A depth, 1989–2002
  { id: "sampdoria_1990_91", name: "Sampdoria — 1990/91", abbr: "SAM", season: "1990/91", manager: "Vujadin Boskov", stadium: "stadio_luigi_ferraris", colors: ["#1b4f9c", "#e31b23"], xi: "Gianluca Pagliuca|Moreno Mannini|Pietro Vierchowod|Marco Lanna|Luca Pellegrini|Attilio Lombardo|Fausto Pari|Srecko Katanec|Ivano Bonetti|Gianluca Vialli|Roberto Mancini", bench: namedBench("sampdoria_1990_91") },
  { id: "napoli_1989_90", name: "Napoli — 1989/90", abbr: "NAP", season: "1989/90", manager: "Albertino Bigon", stadium: "stadio_san_paolo", colors: ["#12a0d7", "#ffffff"], xi: "Giuliano Giuliani|Ciro Ferrara|Marco Baroni|Antonio Corradini|Giovanni Francini|Fernando De Napoli|Massimo Crippa|Alemao|Andrea Carnevale|Diego Maradona|Careca", bench: namedBench("napoli_1989_90") },
  { id: "juventus_1997_98", name: "Juventus — 1997/98", abbr: "JUV", season: "1997/98", manager: "Marcello Lippi", stadium: "stadio_delle_alpi", colors: ["#111111", "#f4f4f4"], xi: "Angelo Peruzzi|Lilian Thuram|Ciro Ferrara|Paolo Montero|Gianluca Pessotto|Angelo Di Livio|Didier Deschamps|Edgar Davids|Zinedine Zidane|Alessandro Del Piero|Filippo Inzaghi", bench: namedBench("juventus_1997_98") },
  { id: "fiorentina_1998_99", name: "Fiorentina — 1998/99", abbr: "FIO", season: "1998/99", manager: "Giovanni Trapattoni", stadium: "stadio_artemio_franchi", colors: ["#6b2d8b", "#ffffff"], xi: "Francesco Toldo|Tomas Repka|Lorenzo Amoruso|Pasquale Padalino|Moreno Torricelli|Rui Costa|Guillermo Amor|Sandro Cois|Edmundo|Gabriel Batistuta|Luis Oliveira", bench: namedBench("fiorentina_1998_99") },
  { id: "parma_1992_93", name: "Parma — 1992/93", abbr: "PAR", season: "1992/93", manager: "Nevio Scala", stadium: "stadio_tardini", colors: ["#ffffff", "#1d4f91"], xi: "Marco Ballotta|Antonio Benarrivo|Lorenzo Minotti|Georges Grun|Alberto Di Chiara|Gabriele Pin|Daniele Zoratto|Marco Osio|Tomas Brolin|Faustino Asprilla|Alessandro Melli", bench: namedBench("parma_1992_93") },
  { id: "torino_1991_92", name: "Torino — 1991/92", abbr: "TOR", season: "1991/92", manager: "Emiliano Mondonico", stadium: "stadio_delle_alpi", colors: ["#8b1a1a", "#ffffff"], xi: "Luca Marchegiani|Roberto Policano|Roberto Cravero|Enrico Annoni|Giorgio Venturin|Gianluigi Lentini|Enzo Scifo|Rafael Martin Vazquez|Giorgio Bresciani|Walter Casagrande|Christian Vieri", bench: namedBench("torino_1991_92") },
  // Early-90s Serie A depth + one other key European side
  {
    id: "lazio_1992_93",
    name: "Lazio — 1992/93",
    abbr: "LAZ",
    season: "1992/93",
    manager: "Dino Zoff",
    stadium: "stadio_olimpico",
    colors: ["#87ceeb", "#ffffff"],
    xi: "Fernando Orsi|Roberto Cravero|Roberto Bergodi|Luca Luzardi|Giuseppe Favalli|Diego Fuser|Aron Winter|Paul Gascoigne|Karl-Heinz Riedle|Giuseppe Signori|Alen Boksic",
    bench: namedBench("lazio_1992_93"),
  },
  {
    id: "inter_1993_94",
    name: "Inter Milan — 1993/94",
    abbr: "INT",
    season: "1993/94",
    manager: "Giampiero Marini",
    stadium: "san_siro",
    colors: ["#0068a8", "#000000"],
    tournament: "1993/94 UEFA Cup",
    xi: "Gianluca Pagliuca|Giuseppe Bergomi|Riccardo Ferri|Antonio Manicone|Massimo Paganin|Nicola Berti|Dennis Bergkamp|Wim Jonk|Ruben Sosa|Igor Shalimov|Darko Pancev",
    bench: namedBench("inter_1993_94"),
  },
  {
    id: "roma_1992_93",
    name: "Roma — 1992/93",
    abbr: "ROM",
    season: "1992/93",
    manager: "Vujadin Boskov",
    stadium: "stadio_olimpico",
    colors: ["#8e1f2f", "#f0bc42"],
    xi: "Giovanni Cervone|Amedeo Carboni|Aldair|Antonio Tempestilli|Antonio Bonifazi|Thomas Hassler|Giuseppe Giannini|Siniša Mihajlović|Rudi Voller|Claudio Caniggia|Abel Balbo",
    bench: namedBench("roma_1992_93"),
  },
  {
    id: "ipswich_1980_81",
    name: "Ipswich Town — 1980/81",
    abbr: "IPS",
    season: "1980/81",
    manager: "Bobby Robson",
    stadium: "portman_road",
    colors: ["#0057b8", "#ffffff"],
    tournament: "1980/81 UEFA Cup",
    xi: "Paul Cooper|George Burley|Terry Butcher|Russell Osman|Mick Mills|Frans Thijssen|Arnold Muhren|John Wark|Alan Brazil|Paul Mariner|Eric Gates",
    bench: namedBench("ipswich_1980_81"),
  },
];

export const CLASSIC_V4_DEFINITIONS: ClassicTeamDefinition[] = EXPANSION.map((spec) => buildFromCompact(compact(spec)));
