import type * as prismic from "@prismicio/client";

type Simplify<T> = { [KeyType in keyof T]: T[KeyType] };


type PickContentRelationshipFieldData<
	TRelationship extends prismic.CustomTypeModelFetchCustomTypeLevel1 | prismic.CustomTypeModelFetchCustomTypeLevel2 | prismic.CustomTypeModelFetchGroupLevel1 | prismic.CustomTypeModelFetchGroupLevel2,
	TData extends Record<string, prismic.AnyRegularField | prismic.GroupField | prismic.NestedGroupField | prismic.SliceZone>,
	TLang extends string
> = |
	// Content relationship fields
	{
		[TSubRelationship in Extract<
			TRelationship["fields"][number], prismic.CustomTypeModelFetchContentRelationshipLevel1
		> as TSubRelationship["id"]]:
			ContentRelationshipFieldWithData<TSubRelationship["customtypes"], TLang>;
	} &
	// Group
	{
		[TGroup in Extract<
			TRelationship["fields"][number], prismic.CustomTypeModelFetchGroupLevel1 | prismic.CustomTypeModelFetchGroupLevel2
		> as TGroup["id"]]:
			TData[TGroup["id"]] extends prismic.GroupField<infer TGroupData>
				? prismic.GroupField<PickContentRelationshipFieldData<TGroup, TGroupData, TLang>>
				: never
	} &
	// Other fields
	{
		[TFieldKey in Extract<TRelationship["fields"][number], string>]:
			TFieldKey extends keyof TData ? TData[TFieldKey] : never;
	};

type ContentRelationshipFieldWithData<
	TCustomType extends readonly (prismic.CustomTypeModelFetchCustomTypeLevel1 | string)[] | readonly (prismic.CustomTypeModelFetchCustomTypeLevel2 | string)[],
	TLang extends string = string
> = {
	[ID in Exclude<TCustomType[number], string>["id"]]:
		prismic.ContentRelationshipField<
			ID,
			TLang,
			PickContentRelationshipFieldData<
				Extract<TCustomType[number], { id: ID }>,
				Extract<prismic.Content.AllDocumentTypes, { type: ID }>["data"],
				TLang
			>
		>
}[Exclude<TCustomType[number], string>["id"]];

/**
 * Content for Author documents
 */
interface AuthorDocumentData {
	/**
	 * Name field in *Author*
	 *
	 * - **Field Type**: Text
	 * - **Placeholder**: *None*
	 * - **API ID Path**: author.name
	 * - **Tab**: Main
	 * - **Documentation**: https://prismic.io/docs/fields/text
	 */
	name: prismic.KeyTextField;
	
	/**
	 * Sort name field in *Author*
	 *
	 * - **Field Type**: Text
	 * - **Placeholder**: Surname, Given names (optional)
	 * - **API ID Path**: author.sort_name
	 * - **Tab**: Main
	 * - **Documentation**: https://prismic.io/docs/fields/text
	 */
	sort_name: prismic.KeyTextField;
	
	/**
	 * Photo field in *Author*
	 *
	 * - **Field Type**: Image
	 * - **Placeholder**: *None*
	 * - **API ID Path**: author.photo
	 * - **Tab**: Main
	 * - **Documentation**: https://prismic.io/docs/fields/image
	 */
	photo: prismic.ImageField<never>;
	
	/**
	 * Bio field in *Author*
	 *
	 * - **Field Type**: Rich Text
	 * - **Placeholder**: *None*
	 * - **API ID Path**: author.bio
	 * - **Tab**: Main
	 * - **Documentation**: https://prismic.io/docs/fields/rich-text
	 */
	bio: prismic.RichTextField;
}

/**
 * Author document from Prismic
 *
 * - **API ID**: `author`
 * - **Repeatable**: `true`
 * - **Documentation**: https://prismic.io/docs/content-modeling
 *
 * @typeParam Lang - Language API ID of the document.
 */
export type AuthorDocument<Lang extends string = string> = prismic.PrismicDocumentWithUID<Simplify<AuthorDocumentData>, "author", Lang>;

/**
 * Item in *Book → Authors*
 */
export interface BookDocumentDataAuthorsItem {
	/**
	 * Author field in *Book → Authors*
	 *
	 * - **Field Type**: Content Relationship
	 * - **Placeholder**: *None*
	 * - **API ID Path**: book.authors[].author
	 * - **Documentation**: https://prismic.io/docs/fields/content-relationship
	 */
	author: prismic.ContentRelationshipField<"author">;
}

/**
 * Item in *Book → Contributors*
 */
export interface BookDocumentDataContributorsItem {
	/**
	 * Name field in *Book → Contributors*
	 *
	 * - **Field Type**: Text
	 * - **Placeholder**: *None*
	 * - **API ID Path**: book.contributors[].name
	 * - **Documentation**: https://prismic.io/docs/fields/text
	 */
	name: prismic.KeyTextField;
	
	/**
	 * Role field in *Book → Contributors*
	 *
	 * - **Field Type**: Select
	 * - **Placeholder**: *None*
	 * - **API ID Path**: book.contributors[].role
	 * - **Documentation**: https://prismic.io/docs/fields/select
	 */
	role: prismic.SelectField<"narrator" | "translator" | "editor" | "illustrator" | "other">;
}

/**
 * Item in *Book → Genres*
 */
export interface BookDocumentDataGenresItem {
	/**
	 * Genre field in *Book → Genres*
	 *
	 * - **Field Type**: Content Relationship
	 * - **Placeholder**: *None*
	 * - **API ID Path**: book.genres[].genre
	 * - **Documentation**: https://prismic.io/docs/fields/content-relationship
	 */
	genre: prismic.ContentRelationshipField<"genre">;
}

/**
 * Item in *Book → Dates read*
 */
export interface BookDocumentDataDatesReadItem {
	/**
	 * Started field in *Book → Dates read*
	 *
	 * - **Field Type**: Date
	 * - **Placeholder**: *None*
	 * - **API ID Path**: book.dates_read[].date_started
	 * - **Documentation**: https://prismic.io/docs/fields/date
	 */
	date_started: prismic.DateField;
	
	/**
	 * Finished field in *Book → Dates read*
	 *
	 * - **Field Type**: Date
	 * - **Placeholder**: *None*
	 * - **API ID Path**: book.dates_read[].date_finished
	 * - **Documentation**: https://prismic.io/docs/fields/date
	 */
	date_finished: prismic.DateField;
}

/**
 * Item in *Book → Moods*
 */
export interface BookDocumentDataMoodsItem {
	/**
	 * Mood field in *Book → Moods*
	 *
	 * - **Field Type**: Text
	 * - **Placeholder**: *None*
	 * - **API ID Path**: book.moods[].mood
	 * - **Documentation**: https://prismic.io/docs/fields/text
	 */
	mood: prismic.KeyTextField;
}

/**
 * Content for Book documents
 */
interface BookDocumentData {
	/**
	 * Title field in *Book*
	 *
	 * - **Field Type**: Text
	 * - **Placeholder**: *None*
	 * - **API ID Path**: book.title
	 * - **Tab**: Main
	 * - **Documentation**: https://prismic.io/docs/fields/text
	 */
	title: prismic.KeyTextField;
	
	/**
	 * Subtitle field in *Book*
	 *
	 * - **Field Type**: Text
	 * - **Placeholder**: *None*
	 * - **API ID Path**: book.subtitle
	 * - **Tab**: Main
	 * - **Documentation**: https://prismic.io/docs/fields/text
	 */
	subtitle: prismic.KeyTextField;
	
	/**
	 * Authors field in *Book*
	 *
	 * - **Field Type**: Group
	 * - **Placeholder**: *None*
	 * - **API ID Path**: book.authors[]
	 * - **Tab**: Main
	 * - **Documentation**: https://prismic.io/docs/fields/repeatable-group
	 */
	authors: prismic.GroupField<Simplify<BookDocumentDataAuthorsItem>>;
	
	/**
	 * Contributors field in *Book*
	 *
	 * - **Field Type**: Group
	 * - **Placeholder**: *None*
	 * - **API ID Path**: book.contributors[]
	 * - **Tab**: Main
	 * - **Documentation**: https://prismic.io/docs/fields/repeatable-group
	 */
	contributors: prismic.GroupField<Simplify<BookDocumentDataContributorsItem>>;
	
	/**
	 * Series field in *Book*
	 *
	 * - **Field Type**: Content Relationship
	 * - **Placeholder**: *None*
	 * - **API ID Path**: book.series
	 * - **Tab**: Main
	 * - **Documentation**: https://prismic.io/docs/fields/content-relationship
	 */
	series: prismic.ContentRelationshipField<"series">;
	
	/**
	 * Series position field in *Book*
	 *
	 * - **Field Type**: Number
	 * - **Placeholder**: *None*
	 * - **API ID Path**: book.series_position
	 * - **Tab**: Main
	 * - **Documentation**: https://prismic.io/docs/fields/number
	 */
	series_position: prismic.NumberField;
	
	/**
	 * Genres field in *Book*
	 *
	 * - **Field Type**: Group
	 * - **Placeholder**: *None*
	 * - **API ID Path**: book.genres[]
	 * - **Tab**: Main
	 * - **Documentation**: https://prismic.io/docs/fields/repeatable-group
	 */
	genres: prismic.GroupField<Simplify<BookDocumentDataGenresItem>>;
	
	/**
	 * Cover field in *Book*
	 *
	 * - **Field Type**: Image
	 * - **Placeholder**: *None*
	 * - **API ID Path**: book.cover
	 * - **Tab**: Main
	 * - **Documentation**: https://prismic.io/docs/fields/image
	 */
	cover: prismic.ImageField<never>;
	
	/**
	 * ISBN / StoryGraph UID field in *Book*
	 *
	 * - **Field Type**: Text
	 * - **Placeholder**: ISBN-13, ISBN-10, ASIN or empty
	 * - **API ID Path**: book.isbn
	 * - **Tab**: Main
	 * - **Documentation**: https://prismic.io/docs/fields/text
	 */
	isbn: prismic.KeyTextField;
	
	/**
	 * Publish year field in *Book*
	 *
	 * - **Field Type**: Number
	 * - **Placeholder**: *None*
	 * - **API ID Path**: book.publish_year
	 * - **Tab**: Main
	 * - **Documentation**: https://prismic.io/docs/fields/number
	 */
	publish_year: prismic.NumberField;
	
	/**
	 * Page count field in *Book*
	 *
	 * - **Field Type**: Number
	 * - **Placeholder**: *None*
	 * - **API ID Path**: book.page_count
	 * - **Tab**: Main
	 * - **Documentation**: https://prismic.io/docs/fields/number
	 */
	page_count: prismic.NumberField;
	
	/**
	 * Format field in *Book*
	 *
	 * - **Field Type**: Select
	 * - **Placeholder**: *None*
	 * - **API ID Path**: book.format
	 * - **Tab**: Main
	 * - **Documentation**: https://prismic.io/docs/fields/select
	 */
	format: prismic.SelectField<"paperback" | "hardcover" | "digital" | "audio">;
	
	/**
	 * Owned field in *Book*
	 *
	 * - **Field Type**: Boolean
	 * - **Placeholder**: *None*
	 * - **Default Value**: false
	 * - **API ID Path**: book.owned
	 * - **Tab**: Main
	 * - **Documentation**: https://prismic.io/docs/fields/boolean
	 */
	owned: prismic.BooleanField;
	
	/**
	 * Description / blurb field in *Book*
	 *
	 * - **Field Type**: Rich Text
	 * - **Placeholder**: *None*
	 * - **API ID Path**: book.blurb
	 * - **Tab**: Main
	 * - **Documentation**: https://prismic.io/docs/fields/rich-text
	 */
	blurb: prismic.RichTextField;/**
	 * Read status field in *Book*
	 *
	 * - **Field Type**: Select
	 * - **Placeholder**: *None*
	 * - **API ID Path**: book.read_status
	 * - **Tab**: Reading
	 * - **Documentation**: https://prismic.io/docs/fields/select
	 */
	read_status: prismic.SelectField<"to-read" | "currently-reading" | "read" | "did-not-finish" | "paused">;
	
	/**
	 * Date added field in *Book*
	 *
	 * - **Field Type**: Date
	 * - **Placeholder**: *None*
	 * - **API ID Path**: book.date_added
	 * - **Tab**: Reading
	 * - **Documentation**: https://prismic.io/docs/fields/date
	 */
	date_added: prismic.DateField;
	
	/**
	 * Last date read field in *Book*
	 *
	 * - **Field Type**: Date
	 * - **Placeholder**: *None*
	 * - **API ID Path**: book.last_date_read
	 * - **Tab**: Reading
	 * - **Documentation**: https://prismic.io/docs/fields/date
	 */
	last_date_read: prismic.DateField;
	
	/**
	 * Year read field in *Book*
	 *
	 * - **Field Type**: Number
	 * - **Placeholder**: *None*
	 * - **API ID Path**: book.year_read
	 * - **Tab**: Reading
	 * - **Documentation**: https://prismic.io/docs/fields/number
	 */
	year_read: prismic.NumberField;
	
	/**
	 * Read count field in *Book*
	 *
	 * - **Field Type**: Number
	 * - **Placeholder**: *None*
	 * - **API ID Path**: book.read_count
	 * - **Tab**: Reading
	 * - **Documentation**: https://prismic.io/docs/fields/number
	 */
	read_count: prismic.NumberField;
	
	/**
	 * Dates read field in *Book*
	 *
	 * - **Field Type**: Group
	 * - **Placeholder**: *None*
	 * - **API ID Path**: book.dates_read[]
	 * - **Tab**: Reading
	 * - **Documentation**: https://prismic.io/docs/fields/repeatable-group
	 */
	dates_read: prismic.GroupField<Simplify<BookDocumentDataDatesReadItem>>;
	
	/**
	 * Star rating field in *Book*
	 *
	 * - **Field Type**: Number
	 * - **Placeholder**: *None*
	 * - **API ID Path**: book.rating
	 * - **Tab**: Reading
	 * - **Documentation**: https://prismic.io/docs/fields/number
	 */
	rating: prismic.NumberField;
	
	/**
	 * Review (private, not displayed in v1) field in *Book*
	 *
	 * - **Field Type**: Rich Text
	 * - **Placeholder**: *None*
	 * - **API ID Path**: book.review
	 * - **Tab**: Reading
	 * - **Documentation**: https://prismic.io/docs/fields/rich-text
	 */
	review: prismic.RichTextField;/**
	 * Moods field in *Book*
	 *
	 * - **Field Type**: Group
	 * - **Placeholder**: *None*
	 * - **API ID Path**: book.moods[]
	 * - **Tab**: StoryGraph
	 * - **Documentation**: https://prismic.io/docs/fields/repeatable-group
	 */
	moods: prismic.GroupField<Simplify<BookDocumentDataMoodsItem>>;
	
	/**
	 * Pace field in *Book*
	 *
	 * - **Field Type**: Select
	 * - **Placeholder**: *None*
	 * - **API ID Path**: book.pace
	 * - **Tab**: StoryGraph
	 * - **Documentation**: https://prismic.io/docs/fields/select
	 */
	pace: prismic.SelectField<"slow" | "medium" | "fast">;
	
	/**
	 * Character- or plot-driven? field in *Book*
	 *
	 * - **Field Type**: Select
	 * - **Placeholder**: *None*
	 * - **API ID Path**: book.character_or_plot_driven
	 * - **Tab**: StoryGraph
	 * - **Documentation**: https://prismic.io/docs/fields/select
	 */
	character_or_plot_driven: prismic.SelectField<"Character" | "Plot" | "A mix">;
	
	/**
	 * Strong character development? field in *Book*
	 *
	 * - **Field Type**: Select
	 * - **Placeholder**: *None*
	 * - **API ID Path**: book.strong_character_development
	 * - **Tab**: StoryGraph
	 * - **Documentation**: https://prismic.io/docs/fields/select
	 */
	strong_character_development: prismic.SelectField<"Yes" | "No" | "It's complicated">;
	
	/**
	 * Loveable characters? field in *Book*
	 *
	 * - **Field Type**: Select
	 * - **Placeholder**: *None*
	 * - **API ID Path**: book.loveable_characters
	 * - **Tab**: StoryGraph
	 * - **Documentation**: https://prismic.io/docs/fields/select
	 */
	loveable_characters: prismic.SelectField<"Yes" | "No" | "It's complicated">;
	
	/**
	 * Diverse characters? field in *Book*
	 *
	 * - **Field Type**: Select
	 * - **Placeholder**: *None*
	 * - **API ID Path**: book.diverse_characters
	 * - **Tab**: StoryGraph
	 * - **Documentation**: https://prismic.io/docs/fields/select
	 */
	diverse_characters: prismic.SelectField<"Yes" | "No" | "It's complicated">;
	
	/**
	 * Flawed characters? field in *Book*
	 *
	 * - **Field Type**: Select
	 * - **Placeholder**: *None*
	 * - **API ID Path**: book.flawed_characters
	 * - **Tab**: StoryGraph
	 * - **Documentation**: https://prismic.io/docs/fields/select
	 */
	flawed_characters: prismic.SelectField<"Yes" | "No" | "It's complicated">;
	
	/**
	 * Content warnings field in *Book*
	 *
	 * - **Field Type**: Text
	 * - **Placeholder**: As exported, comma-separated
	 * - **API ID Path**: book.content_warnings
	 * - **Tab**: StoryGraph
	 * - **Documentation**: https://prismic.io/docs/fields/text
	 */
	content_warnings: prismic.KeyTextField;
	
	/**
	 * Content warning description field in *Book*
	 *
	 * - **Field Type**: Text
	 * - **Placeholder**: *None*
	 * - **API ID Path**: book.content_warning_description
	 * - **Tab**: StoryGraph
	 * - **Documentation**: https://prismic.io/docs/fields/text
	 */
	content_warning_description: prismic.KeyTextField;
	
	/**
	 * Source field in *Book*
	 *
	 * - **Field Type**: Select
	 * - **Placeholder**: *None*
	 * - **Default Value**: manual
	 * - **API ID Path**: book.source
	 * - **Tab**: StoryGraph
	 * - **Documentation**: https://prismic.io/docs/fields/select
	 */
	source: prismic.SelectField<"storygraph" | "goodreads" | "manual", "filled">;
}

/**
 * Book document from Prismic
 *
 * - **API ID**: `book`
 * - **Repeatable**: `true`
 * - **Documentation**: https://prismic.io/docs/content-modeling
 *
 * @typeParam Lang - Language API ID of the document.
 */
export type BookDocument<Lang extends string = string> = prismic.PrismicDocumentWithUID<Simplify<BookDocumentData>, "book", Lang>;

/**
 * Content for Genre documents
 */
interface GenreDocumentData {
	/**
	 * Name field in *Genre*
	 *
	 * - **Field Type**: Text
	 * - **Placeholder**: Genre, e.g. Science fiction
	 * - **API ID Path**: genre.name
	 * - **Tab**: Main
	 * - **Documentation**: https://prismic.io/docs/fields/text
	 */
	name: prismic.KeyTextField;
	
	/**
	 * Accent colour field in *Genre*
	 *
	 * - **Field Type**: Color
	 * - **Placeholder**: *None*
	 * - **API ID Path**: genre.accent
	 * - **Tab**: Main
	 * - **Documentation**: https://prismic.io/docs/fields/color
	 */
	accent: prismic.ColorField;
	
	/**
	 * Description field in *Genre*
	 *
	 * - **Field Type**: Text
	 * - **Placeholder**: *None*
	 * - **API ID Path**: genre.description
	 * - **Tab**: Main
	 * - **Documentation**: https://prismic.io/docs/fields/text
	 */
	description: prismic.KeyTextField;
}

/**
 * Genre document from Prismic
 *
 * - **API ID**: `genre`
 * - **Repeatable**: `true`
 * - **Documentation**: https://prismic.io/docs/content-modeling
 *
 * @typeParam Lang - Language API ID of the document.
 */
export type GenreDocument<Lang extends string = string> = prismic.PrismicDocumentWithUID<Simplify<GenreDocumentData>, "genre", Lang>;

/**
 * Content for Series documents
 */
interface SeriesDocumentData {
	/**
	 * Name field in *Series*
	 *
	 * - **Field Type**: Text
	 * - **Placeholder**: *None*
	 * - **API ID Path**: series.name
	 * - **Tab**: Main
	 * - **Documentation**: https://prismic.io/docs/fields/text
	 */
	name: prismic.KeyTextField;
	
	/**
	 * Description field in *Series*
	 *
	 * - **Field Type**: Rich Text
	 * - **Placeholder**: *None*
	 * - **API ID Path**: series.description
	 * - **Tab**: Main
	 * - **Documentation**: https://prismic.io/docs/fields/rich-text
	 */
	description: prismic.RichTextField;
}

/**
 * Series document from Prismic
 *
 * - **API ID**: `series`
 * - **Repeatable**: `true`
 * - **Documentation**: https://prismic.io/docs/content-modeling
 *
 * @typeParam Lang - Language API ID of the document.
 */
export type SeriesDocument<Lang extends string = string> = prismic.PrismicDocumentWithUID<Simplify<SeriesDocumentData>, "series", Lang>;

/**
 * Item in *Shelf → Books (in display order)*
 */
export interface ShelfDocumentDataBooksItem {
	/**
	 * Book field in *Shelf → Books (in display order)*
	 *
	 * - **Field Type**: Content Relationship
	 * - **Placeholder**: *None*
	 * - **API ID Path**: shelf.books[].book
	 * - **Documentation**: https://prismic.io/docs/fields/content-relationship
	 */
	book: prismic.ContentRelationshipField<"book">;
}

/**
 * Content for Shelf documents
 */
interface ShelfDocumentData {
	/**
	 * Title field in *Shelf*
	 *
	 * - **Field Type**: Text
	 * - **Placeholder**: *None*
	 * - **API ID Path**: shelf.title
	 * - **Tab**: Main
	 * - **Documentation**: https://prismic.io/docs/fields/text
	 */
	title: prismic.KeyTextField;
	
	/**
	 * Description field in *Shelf*
	 *
	 * - **Field Type**: Rich Text
	 * - **Placeholder**: *None*
	 * - **API ID Path**: shelf.description
	 * - **Tab**: Main
	 * - **Documentation**: https://prismic.io/docs/fields/rich-text
	 */
	description: prismic.RichTextField;
	
	/**
	 * Layout hint field in *Shelf*
	 *
	 * - **Field Type**: Select
	 * - **Placeholder**: *None*
	 * - **Default Value**: airy
	 * - **API ID Path**: shelf.layout_hint
	 * - **Tab**: Main
	 * - **Documentation**: https://prismic.io/docs/fields/select
	 */
	layout_hint: prismic.SelectField<"dense" | "airy" | "spotlight", "filled">;
	
	/**
	 * Books (in display order) field in *Shelf*
	 *
	 * - **Field Type**: Group
	 * - **Placeholder**: *None*
	 * - **API ID Path**: shelf.books[]
	 * - **Tab**: Main
	 * - **Documentation**: https://prismic.io/docs/fields/repeatable-group
	 */
	books: prismic.GroupField<Simplify<ShelfDocumentDataBooksItem>>;
}

/**
 * Shelf document from Prismic
 *
 * - **API ID**: `shelf`
 * - **Repeatable**: `true`
 * - **Documentation**: https://prismic.io/docs/content-modeling
 *
 * @typeParam Lang - Language API ID of the document.
 */
export type ShelfDocument<Lang extends string = string> = prismic.PrismicDocumentWithUID<Simplify<ShelfDocumentData>, "shelf", Lang>;

/**
 * Content for Site settings documents
 */
interface SiteSettingsDocumentData {
	/**
	 * Site title field in *Site settings*
	 *
	 * - **Field Type**: Text
	 * - **Placeholder**: *None*
	 * - **API ID Path**: site_settings.site_title
	 * - **Tab**: Main
	 * - **Documentation**: https://prismic.io/docs/fields/text
	 */
	site_title: prismic.KeyTextField;
	
	/**
	 * Tagline field in *Site settings*
	 *
	 * - **Field Type**: Text
	 * - **Placeholder**: *None*
	 * - **API ID Path**: site_settings.tagline
	 * - **Tab**: Main
	 * - **Documentation**: https://prismic.io/docs/fields/text
	 */
	tagline: prismic.KeyTextField;
	
	/**
	 * About field in *Site settings*
	 *
	 * - **Field Type**: Rich Text
	 * - **Placeholder**: *None*
	 * - **API ID Path**: site_settings.about
	 * - **Tab**: Main
	 * - **Documentation**: https://prismic.io/docs/fields/rich-text
	 */
	about: prismic.RichTextField;
	
	/**
	 * Featured shelf field in *Site settings*
	 *
	 * - **Field Type**: Content Relationship
	 * - **Placeholder**: *None*
	 * - **API ID Path**: site_settings.featured_shelf
	 * - **Tab**: Main
	 * - **Documentation**: https://prismic.io/docs/fields/content-relationship
	 */
	featured_shelf: prismic.ContentRelationshipField<"shelf">;/**
	 * Meta description field in *Site settings*
	 *
	 * - **Field Type**: Text
	 * - **Placeholder**: *None*
	 * - **API ID Path**: site_settings.meta_description
	 * - **Tab**: SEO
	 * - **Documentation**: https://prismic.io/docs/fields/text
	 */
	meta_description: prismic.KeyTextField;
	
	/**
	 * Meta image field in *Site settings*
	 *
	 * - **Field Type**: Image
	 * - **Placeholder**: *None*
	 * - **API ID Path**: site_settings.meta_image
	 * - **Tab**: SEO
	 * - **Documentation**: https://prismic.io/docs/fields/image
	 */
	meta_image: prismic.ImageField<never>;
}

/**
 * Site settings document from Prismic
 *
 * - **API ID**: `site_settings`
 * - **Repeatable**: `false`
 * - **Documentation**: https://prismic.io/docs/content-modeling
 *
 * @typeParam Lang - Language API ID of the document.
 */
export type SiteSettingsDocument<Lang extends string = string> = prismic.PrismicDocumentWithoutUID<Simplify<SiteSettingsDocumentData>, "site_settings", Lang>;

export type AllDocumentTypes = AuthorDocument | BookDocument | GenreDocument | SeriesDocument | ShelfDocument | SiteSettingsDocument;

declare module "@prismicio/client" {
	interface CreateClient {
		(repositoryNameOrEndpoint: string, options?: prismic.ClientConfig): prismic.Client<AllDocumentTypes>;
	}
	
	interface CreateWriteClient {
		(repositoryNameOrEndpoint: string, options: prismic.WriteClientConfig): prismic.WriteClient<AllDocumentTypes>;
	}
	
	interface CreateMigration {
		(): prismic.Migration<AllDocumentTypes>;
	}
	
	namespace Content {
		export type {
			AuthorDocument,
			AuthorDocumentData,
			BookDocument,
			BookDocumentData,
			BookDocumentDataAuthorsItem,
			BookDocumentDataContributorsItem,
			BookDocumentDataGenresItem,
			BookDocumentDataDatesReadItem,
			BookDocumentDataMoodsItem,
			GenreDocument,
			GenreDocumentData,
			SeriesDocument,
			SeriesDocumentData,
			ShelfDocument,
			ShelfDocumentData,
			ShelfDocumentDataBooksItem,
			SiteSettingsDocument,
			SiteSettingsDocumentData,
			AllDocumentTypes
		}
	}
}