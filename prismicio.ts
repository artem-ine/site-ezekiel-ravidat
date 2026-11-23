import {
	createClient as baseCreateClient,
	type ClientConfig,
} from "@prismicio/client";
import prismicConfig from "./prismic.config.json";

export const repositoryName =
	process.env.NEXT_PUBLIC_PRISMIC_ENVIRONMENT || prismicConfig.repositoryName;

export const createClient = (config: ClientConfig = {}) => {
	return baseCreateClient(repositoryName, {
		accessToken: process.env.PRISMIC_ACCESS_TOKEN,
		routes: prismicConfig.routes,
		...config,
	});
};
