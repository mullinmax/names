// Built-in name lists. These are seeded into the user's list store on first
// load and behave exactly like user-created lists from then on (rename, edit,
// copy, delete). "Restore missing built-ins" in the lists manager re-adds any
// that were deleted.
const L = s => s.trim().split(/\s+/);

export const DEFAULT_LISTS = [
  {
    id: 'classics',
    name: 'Timeless classics',
    names: L('James Mary William Elizabeth John Katherine Thomas Anne'),
  },
  {
    id: 'fifties',
    name: '1950s favorites',
    names: L('Linda Deborah Gary Ronald Patricia Dennis Sandra Larry'),
  },
  {
    id: 'nineties',
    name: '1990s kids',
    names: L('Ashley Brittany Tyler Brandon Megan Cody Kayla Austin'),
  },
  {
    id: 'comeback',
    name: 'Comeback vintage',
    names: L('Hazel Eleanor Theodore Arthur Mabel Otis Ida Silas'),
  },
  {
    id: 'popculture',
    name: 'Pop-culture spikes',
    names: L('Khaleesi Miley Neo Kylo Arya Elsa Farrah Kobe'),
  },
  {
    id: 'genderbenders',
    name: 'Gender benders',
    names: L('Leslie Ashley Madison Aubrey Riley Casey Jordan Avery'),
  },
  {
    id: 'biblical',
    name: 'Biblical',
    names: L(`Mary Elizabeth Sarah Rebecca Rachel Ruth Hannah Leah Esther Naomi
      Abigail Deborah Eve Delilah Miriam Martha Judith Tabitha Phoebe Lydia
      Priscilla Joanna Dinah Michael David James John Matthew Mark Luke Paul
      Peter Andrew Thomas Joseph Daniel Samuel Benjamin Jacob Joshua Caleb
      Aaron Adam Noah Abraham Isaac Elijah Isaiah Jeremiah Ezekiel Jonah Levi
      Simon Stephen Philip Timothy Titus Silas Gabriel Nathaniel Nathan Solomon
      Gideon Ezra Asher Eli Seth Reuben Judah Amos Hosea Malachi Zechariah
      Josiah Jesse Boaz Enoch Moses Tobias Bartholomew Thaddeus Matthias
      Cornelius Jude Micah Joel Obadiah Nehemiah Zachariah`),
  },
  {
    id: 'presidents',
    name: 'Presidential',
    names: L(`Washington Jefferson Madison Monroe Quincy Jackson Tyler Polk
      Taylor Pierce Buchanan Lincoln Grant Hayes Garfield Arthur Cleveland
      Harrison McKinley Roosevelt Taft Wilson Harding Coolidge Hoover Truman
      Kennedy Nixon Ford Carter Reagan Clinton Obama Abraham Theodore
      Franklin Dwight Lyndon Ronald Woodrow Calvin Ulysses Grover Rutherford
      Millard Chester Barack`),
  },
  {
    id: 'virtue',
    name: 'Virtue',
    names: L(`Faith Hope Charity Grace Patience Prudence Honor Mercy Verity
      Constance Temperance Felicity Joy Justice Chastity Amity Serenity
      Harmony Honesty Loyal Noble True Merit Earnest Sincere Glory Bliss
      Haven Promise Trinity Destiny Genesis Heaven Miracle Blessing`),
  },
  {
    id: 'nature',
    name: 'Nature & Flowers',
    names: L(`Rose Lily Violet Daisy Iris Ivy Hazel Willow Olive Flora Fern
      Heather Holly Jasmine Dahlia Poppy Magnolia Laurel Juniper River Skye
      Forrest Meadow Wren Robin Lark Sage Aspen Cedar Rowan Briar Clover
      Marigold Azalea Camellia Zinnia Sierra Savannah Autumn Summer Winter
      Brooke Dawn Rain Sky Ocean Canyon Ridge Stone Reed Heath Glen Cliff
      Wolf Fox Bear Hawk Colt Buck Birdie Fawn Petal Posey Tulip Lotus
      Lilac Wisteria Acacia Alder Ash Bay Cypress Elowen Hollis Linden Oakley`),
  },
  {
    id: 'gems',
    name: 'Gems & Jewels',
    names: L(`Pearl Ruby Opal Jade Amber Coral Crystal Sapphire Emerald
      Garnet Beryl Jewel Gemma Goldie Silver Sterling Topaz Onyx Jasper
      Amethyst Diamond Ivory`),
  },
  {
    id: 'myth',
    name: 'Mythological',
    names: L(`Diana Athena Apollo Atlas Orion Luna Aurora Phoenix Penelope
      Cassandra Daphne Persephone Calliope Thalia Selene Juno Venus Minerva
      Freya Thor Odin Loki Achilles Hector Jason Perseus Pandora Artemis
      Echo Iris Hermes Ares Zeus Leda Ajax Ulysses Helen Paris Troy Castor
      Pollux Maia Rhea Gaia Nyx Clio Aphrodite Adonis Damon Evander Leander
      Linus Midas Nestor Orpheus Remus Romulus Silas Titan`),
  },
  {
    id: 'royal',
    name: 'Royal',
    names: L(`Elizabeth Victoria Diana Charlotte George William Harry Henry
      Charles Philip Anne Margaret Mary Edward Albert Alexandra Catherine
      Beatrice Eugenie Louis Archie Camilla Eleanor Anna Jane Richard
      Stephen John James Arthur Alfred Edmund Matilda Adela Cecily`),
  },
];
