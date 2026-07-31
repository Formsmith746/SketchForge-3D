import { createClient } from "next-sanity";
import {
  sanityApiVersion,
  sanityDataset,
  sanityProjectId,
} from "./env";

export const sanityClient = createClient({
  projectId: sanityProjectId,
  dataset: sanityDataset,
  apiVersion: sanityApiVersion,
  useCdn: false,
});
