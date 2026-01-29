export type FrameStep = {
  id: string;
  label: string;
  required: boolean;
};

export type FrameDefinition = {
  slug: string;
  name: string;
  steps: FrameStep[];
};
