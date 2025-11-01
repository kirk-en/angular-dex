import { HttpClientModule } from '@angular/common/http';
import { NgModule } from '@angular/core';

// Apollo imports - these are the GraphQL/Apollo client libraries for Angular
import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client/core';
import { HttpLink } from 'apollo-angular/http';
import { APOLLO_OPTIONS } from 'apollo-angular';

// This is an init function that configures the Apollo client how to behave. Called once when the app starts.
// Comprised of 3 elements: cache, link, and URL.
// URL is where we are sending our GraphQL requests to.
// Link is how we communicate with the endpoint (using HttpLink here for HTTP communication).
// Cache is how we store the response from the graphql server/endpoint.

export const createApollo = (httpLink: HttpLink): ApolloClient.Options => {
  return {
    link: httpLink.create({ uri: 'https://graphql.pokeapi.co/v1beta2' }),
    cache: new InMemoryCache(),
    // Our settings applied to all queries and mutations
    defaultOptions: {
      // watchQueries are queries that stay active and are listening for changes. Like a subscription.
      watchQuery: {
        fetchPolicy: 'cache-and-network',
        // How long (in milliseconds) to wait before fetching from network
        pollInterval: 5 * 60 * 1000,
      },
      // regular queries are one time fetches that run and do not continue listening for changes.
      query: { fetchPolicy: 'cache-first', errorPolicy: 'all' },
    },
  };
};

// This is using Dependency injection, a unique fetaure of angular. NgModule is what is know as a decorator.
// Angular modules are like saying "Here's a bundle of functionality that works together."
@NgModule({
  // Tells angular what imports the module needs to work.
  imports: [HttpClientModule], // this is a built in Angular module that makes network requests.

  // Providers tell Angular the services and configs this module makes available to the entire app. Can be similar to a React context
  providers: [{ provide: APOLLO_OPTIONS, useFactory: createApollo, deps: [HttpLink] }],
})
export class ApolloConfigModule {}
