export type FrameStep = {
	id: string;
	label: string;
	required: boolean;
};

/**
 * What a book's home page and toolkit index lead with. `reading`: where to
 * start reading. `actions`: every action under the situation that calls for
 * it (its `trigger`), for a reader who arrives with the situation already
 * happening.
 */
export type FrameFrontDoor = "reading" | "actions";

export type FrameDefinition = {
	slug: string;
	name: string;
	steps: FrameStep[];
	/** Left out, the front door is `reading`. */
	frontDoor?: FrameFrontDoor;
};
