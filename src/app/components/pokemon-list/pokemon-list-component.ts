import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Apollo, gql } from 'apollo-angular';

// Define our datashapes for Typescript

// Nested types for the sprite shape returned by GraphQL
interface PokemonSpriteShowdown {
  front_default: string | null;
}

interface PokemonSpritesOther {
  showdown: PokemonSpriteShowdown;
}

interface PokemonSprites {
  other: PokemonSpritesOther;
}

interface PokemonSpriteEdge {
  sprites: PokemonSprites;
}

// Types for Pokemon cries returned by GraphQL.
// We model the shape returned by the query; the `cries` object can be null
// or include a `latest` field that we read when a user clicks a Pokémon.
interface PokemonCry {
  latest?: string | null;
}

interface PokemonCryEdge {
  cries?: PokemonCry | null;
}

// Main Pokemon type including optional fields returned by the query.
// We mark the sprite and cries arrays as optional because not every
// record is guaranteed to include them; this prevents TypeScript errors when indexing.
interface Pokemon {
  id: number;
  name: string;
  height?: number;
  weight?: number;
  pokemonsprites?: PokemonSpriteEdge[] | null;
  pokemoncries?: PokemonCryEdge[] | null;
}

interface PokemonListResponse {
  pokemon: Pokemon[];
}

// Our graphQL query to get a list of Pokemon
// The `gql` is just a helper that tells Apollo "This is GraphQL"
// We are writing this query seperatey up here and then passing to Apollo. The query has very similar syntax to a function.
// Reqruied variables are marked with ! (e.g. Int!)

const GET_POKEMON_LIST = gql`
  query GetPokemonList($limit: Int!, $offset: Int!) {
    pokemon: pokemon(limit: $limit, offset: $offset, order_by: { id: asc }) {
      id
      name
      height
      weight
      pokemonsprites {
        sprites
      }
      pokemoncries {
        cries
      }
    }
  }
`;

// 🥡 This is the Decorator i.e. the main stuff of your component!
@Component({
  // This is the html tag name for this component i.e. <app-pokemon-list>
  selector: 'app-pokemon-list',
  standalone: true,
  imports: [CommonModule],
  // This is the HTML template for this component, the front end code being displayed
  template: `
    <audio #audioPlayer></audio>
    <div>
      <p>The sounds of your favorite pocket monsters!</p>
    </div>
    @if (isLoading) {
    <p>This thing is loading right now...</p>
    } @if (error) {
    <p>ERROR</p>
    } @if (pokemonList && pokemonList.length > 0) {
    <ul class="list">
      <!-- track is like a key when mapping in React -->
      @for (pokemon of pokemonList; track pokemon.id) {
      <li class="list__item" (click)="onPokemonClick(pokemon)">
        <div class="flex flex__left">
          <div class="poke-card">
            <img
              src="{{ (pokemon.pokemonsprites?.[0]?.sprites?.other?.showdown?.front_default) || '' }}"
              alt="Image of {{ pokemon.name }}"
              class="list__image"
            />
            <p>{{ pokemon.name }}</p>
          </div>
          <div>waveform!</div>
        </div>
      </li>
      }
    </ul>
    }
  `,

  // This is CSS scoped only to this component.
  styles: [
    `
      .pokemon-list-container {
        padding: 20px;
        max-width: 1200px;
        margin: 0 auto;
      }
      .flex {
        display: flex;
        &__left {
          justify-content: flex-start;
        }
      }
      .poke-card {
        display: flex;
        align-items: center;

        flex-direction: column;
        gap: 10px;
      }
      .list {
        list-style-type: none;
        padding: 0;
        &__item {
          padding: 12px 16px;
          border-bottom: 1px solid #eee;
          &:hover {
            background-color: #f9f9f9;
          }
        }
        &__image {
          height: 150px;
        }
      }
    `,
  ],
})

// Component Class - the logic behind the component
export class PokemonListComponent implements OnInit {
  pokemonList: Pokemon[] = [];
  isLoading: boolean = false;
  error: string | null = null;
  @ViewChild('audioPlayer') audioPlayer!: ElementRef<HTMLAudioElement>;

  constructor(private apollo: Apollo) {}
  // Runs ONCE when component is initialized, great to grab data.
  ngOnInit(): void {
    this.fetchPokemon();
  }

  onPokemonClick(pokemon: Pokemon): void {
    const cryUrl = pokemon?.pokemoncries?.[0]?.cries?.latest || null;
    if (cryUrl) {
      // We use nativeElement here to access the raw HTML element rather than the Anguilar elementRef wrapper.
      this.audioPlayer.nativeElement.src = cryUrl;
      this.audioPlayer.nativeElement.play();
    }
  }

  private fetchPokemon(): void {
    this.isLoading = true;
    this.error = null;

    this.apollo
      .watchQuery<PokemonListResponse>({
        query: GET_POKEMON_LIST,
        variables: { limit: 20, offset: Math.floor(Math.random() * (151 - 20)) },
      })
      .valueChanges.subscribe({
        next: (result) => {
          console.log('Data received:', result);
          if (result.data?.pokemon) {
            this.pokemonList = result.data.pokemon as Pokemon[];
          }
          this.isLoading = false;
        },

        error: (err) => {
          console.error('Error fetching Pokémon:', err);
          this.error = err.message || 'Failed to load Pokémon';
          this.isLoading = false;
        },

        complete: () => {
          console.log('Pokémon query completed');
        },
      });
  }
}
