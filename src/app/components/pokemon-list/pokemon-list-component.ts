import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Apollo, gql } from 'apollo-angular';
import WaveSurfer from 'wavesurfer.js';
import RecordPlugin from 'wavesurfer.js/dist/plugins/record.esm.js';
import { AudioAnalysisService } from '../../services/audio-analysis.service';

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
interface RecorderState {
  wavesurfer: WaveSurfer;
  record: RecordPlugin;
  playbackWavesurfer?: WaveSurfer; // Optional - only exists after recording
  isRecording: boolean;
}
interface SimilarityScores {
  [pokemonId: number]: number; // Index signature: any number key → number value
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
    <div class="pokemon-list-container">
      <div>
        <h1>Pokédex Explorer</h1>
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
        <li class="list__item">
          <main class="flex flex__left">
            <article class="poke-card">
              <img
                src="{{ (pokemon.pokemonsprites?.[0]?.sprites?.other?.showdown?.front_default) || '' }}"
                alt="Image of {{ pokemon.name }}"
                class="list__image"
              />
              <p>{{ pokemon.name }}</p>
            </article>
            <section
              style="width: 100%; display: flex; flex-direction: column; align-items: center; margin: 0 4rem;"
            >
              <div [attr.id]="'recording-' + pokemon.id" class="waveform"></div>
              <div [attr.id]="'waveform-' + pokemon.id" class="waveform"></div>
            </section>
            <div class="button-flex">
              <button class="button3d-blue" (click)="toggleRecording(pokemon.id)">Record</button>
              <button class="button3d-pink" (click)="onPokemonClick(pokemon)">Listen</button>
            </div>
          </main>
        </li>
        }
      </ul>
      }
    </div>
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
        align-items: center;
        &__left {
          justify-content: flex-start;
        }
      }
      .poke-card {
        display: flex;
        align-items: flex-start;

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
          // Container size
          width: 150px;
          height: 150px;
          // Maintain aspect ratio - helps with weird sizes like Horsea and Exeggutor
          object-fit: contain;
          // Center the image in its container
          object-position: center;
        }
      }
      .waveform {
        width: 100%;
      }
      .button-flex {
        display: flex;
        gap: 2rem;
        flex-direction: column;
      }
    `,
  ],
})

// Component Class - the logic behind the component
export class PokemonListComponent implements OnInit, OnDestroy {
  pokemonList: Pokemon[] = [];
  isLoading: boolean = false;
  error: string | null = null;
  private wavesurfers: Map<number, WaveSurfer> = new Map();
  private recordingSessions: Map<number, RecorderState> = new Map();
  similarityScores: SimilarityScores = {};

  constructor(private apollo: Apollo, private audioAnalysis: AudioAnalysisService) {}

  // Runs ONCE when component is initialized, great to grab data.
  ngOnInit(): void {
    this.fetchPokemon();
  }

  /**
   * Cleanup lifecycle hook: Runs when component is destroyed
   *
   * In React, this is like the cleanup function in useEffect:
   *   useEffect(() => {
   *     // setup
   *     return () => {
   *       // cleanup (this is ngOnDestroy in Angular)
   *     };
   *   }, []);
   *
   * Why this matters:
   * - Prevents memory leaks (WaveSurfer instances hold AudioContext references)
   * - Stops any playing audio
   * - Closes AudioContext properly (prevents "Can't close AudioContext twice" error)
   */
  ngOnDestroy(): void {
    this.cleanupWavesurfers();
    this.cleanupRecordingSessions();
  }

  /**
   * Destroy all playback wavesurfer instances
   *
   * When we destroy a WaveSurfer, it closes its AudioContext
   * If we have multiple instances sharing the same context, destroying them
   * in the wrong order causes: "DOMException: Can't close an AudioContext twice"
   */
  private cleanupWavesurfers(): void {
    this.wavesurfers.forEach((wavesurfer) => {
      try {
        wavesurfer.destroy();
      } catch (error) {
        console.warn('Error destroying wavesurfer:', error);
      }
    });
    this.wavesurfers.clear();
  }

  /**
   * Destroy all recording sessions and their waveforms
   *
   * RecorderState can have:
   * - wavesurfer: the recording input display
   * - playbackWavesurfer: optional, the playback display after recording
   *
   * We need to destroy both to properly cleanup the AudioContext
   */
  private cleanupRecordingSessions(): void {
    this.recordingSessions.forEach((session) => {
      try {
        if (session.wavesurfer) {
          session.wavesurfer.destroy();
        }
        if (session.playbackWavesurfer) {
          session.playbackWavesurfer.destroy();
        }
      } catch (error) {
        console.warn('Error destroying recording session:', error);
      }
    });
    this.recordingSessions.clear();
  }

  async compareAudio(pokemonId: number): Promise<void> {
    const session = this.recordingSessions.get(pokemonId);
    if (!session || !session.playbackWavesurfer) {
      console.warn('No recording available to compare');
      return;
    }

    /**
     * Get the Pokemon's cry WaveSurfer instance
     *
     * Type: WaveSurfer | undefined
     * (Map.get() might return undefined if key doesn't exist)
     */
    const pokemonWavesurfer = this.wavesurfers.get(pokemonId);
    if (!pokemonWavesurfer) {
      console.warn('Pokemon audio not loaded yet');
      return;
    }

    /**
     * Extract AudioBuffer from WaveSurfer instances
     *
     * WaveSurfer v7+ changed the API:
     * - Old: wavesurfer.backend.buffer
     * - New: wavesurfer.getDecodedData()
     *
     * getDecodedData() returns the decoded audio data as an AudioBuffer
     * This is what we need to analyze with Meyda
     *
     * Type assertion with 'as any':
     * We use 'as any' because WaveSurfer's TypeScript types might not expose this method
     * This is a common pattern when working with external libraries
     */
    try {
      const pokemonBuffer: AudioBuffer = (pokemonWavesurfer as any).getDecodedData();
      const recordingBuffer: AudioBuffer = (session.playbackWavesurfer as any).getDecodedData();

      /**
       * Extract features from both audio sources
       *
       * TypeScript knows:
       * - extractFeatures returns AudioFeatures | null
       * - We need to check for null before proceeding
       */
      const pokemonFeatures = this.audioAnalysis.extractFeatures(pokemonBuffer);
      const recordingFeatures = this.audioAnalysis.extractFeatures(recordingBuffer);

      /**
       * Type guard: Ensure both feature extractions succeeded
       *
       * if (!pokemonFeatures || !recordingFeatures)
       *     ^^^^^^^^^^^^^^^^^    ^^^^^^^^^^^^^^^^^^
       *     Check not null       Check not null
       *
       * TypeScript's type narrowing:
       * - Before: Both might be null
       * - After this check: Both are definitely AudioFeatures (not null)
       */
      if (!pokemonFeatures || !recordingFeatures) {
        console.error('Failed to extract audio features');
        return;
      }

      /**
       * Calculate similarity score
       *
       * TypeScript ensures:
       * - calculateSimilarity expects two AudioFeatures objects
       * - We're passing the correct types (verified above)
       * - Returns a number (the similarity score)
       */
      const similarity: number = this.audioAnalysis.calculateSimilarity(
        pokemonFeatures,
        recordingFeatures
      );

      /**
       * Store the score in our scores object
       *
       * TypeScript Index Signature:
       * this.similarityScores[pokemonId] = similarity;
       *                      ^^^^^^^^^^    ^^^^^^^^^^
       *                      number key    number value
       *
       * This is allowed because SimilarityScores interface has:
       * [pokemonId: number]: number;
       *
       * If we tried:
       * this.similarityScores[pokemonId] = "high"; // Error!
       * TypeScript: Type 'string' is not assignable to type 'number'
       */
      this.similarityScores[pokemonId] = similarity;

      console.log(`Similarity score for Pokemon ${pokemonId}: ${similarity}%`);
    } catch (error) {
      console.error('Error during audio comparison:', error);
    }
  }

  onPokemonClick(pokemon: Pokemon): void {
    const cryUrl = pokemon?.pokemoncries?.[0]?.cries?.latest || null;
    if (cryUrl) {
      // Create waveform visualization after audio source is set
      this.initializeWaveform(cryUrl, pokemon.id);
    }
  }

  private initializeWaveform(audioUrl: string, pokemonId: number): void {
    // Check if wavesurfer already exists for this pokemon
    const existingWavesurfer = this.wavesurfers.get(pokemonId);
    if (existingWavesurfer) {
      existingWavesurfer.play();
      return;
    }

    const container = document.getElementById(`waveform-${pokemonId}`)!;
    // Create new wavesurfer instance
    const wavesurfer = WaveSurfer.create({
      container,
      waveColor: '#38bce4ff',
      progressColor: '#df4d4dff',
      cursorWidth: 0,
      url: audioUrl,
    });
    wavesurfer.on('ready', () => {
      wavesurfer.play();
    });
    // Store this instance in our map of wavesurfers
    this.wavesurfers.set(pokemonId, wavesurfer);
  }

  private initializeRecording(pokemonId: number): void {
    // Setup is only called once - no need to check for existing session
    // because toggleRecording() already does this check
    //grab container for the recording
    const container = document.getElementById(`recording-${pokemonId}`)!;

    const wavesurfer = WaveSurfer.create({
      container,
      waveColor: '#38bce4ff',
      progressColor: '#df4d4dff',
      // cursorWidth: 2,
    });
    // Initialize the Record plugin
    const record = wavesurfer.registerPlugin(
      RecordPlugin.create({
        renderRecordedAudio: false,
        scrollingWaveform: false,
        continuousWaveform: true,
      })
    ) as RecordPlugin;

    let isRecording: boolean = false;

    record.on('record-end', (blob: Blob) => {
      const recordedUrl = URL.createObjectURL(blob);
      const playbackContainer = document.getElementById(`recording-${pokemonId}`)!;
      // Create wavesurfer from the recorded audio
      const playbackWavesurfer: WaveSurfer = WaveSurfer.create({
        container: playbackContainer,
        waveColor: 'rgba(0, 47, 200, 1)',
        progressColor: 'rgba(217, 17, 224, 1)',
        url: recordedUrl,
      });
      wavesurfer.destroy(); // Clear the original recording waveform -- remove to fix error, let's just hide this wave in the front end
      /**
       * Stop the recording wavesurfer but don't destroy it yet
       *
       * Why not destroy?
       * - Multiple WaveSurfer instances often share the same AudioContext
       * - Destroying too early can cause "Can't close AudioContext twice" error
       * - Let ngOnDestroy handle cleanup when component is removed from DOM
       *
       * In React terms:
       * - Don't cleanup inside event handlers
       * - Do it in the useEffect cleanup function
       * - Here, the "cleanup function" is ngOnDestroy
       */
      wavesurfer.stop();

      // Auto-play when ready
      playbackWavesurfer.on('ready', () => {
        playbackWavesurfer.play();
      });
      const session = this.recordingSessions.get(pokemonId);
      if (session) {
        const updatedSession: any = {
          ...session,
          playbackWavesurfer,
        };
        this.recordingSessions.set(pokemonId, updatedSession);
      }

      // Reset recording state
      isRecording = false;
    });
    this.recordingSessions.set(pokemonId, {
      wavesurfer,
      record,
      isRecording,
    });
  }

  toggleRecording(pokemonId: number): void {
    let session = this.recordingSessions.get(pokemonId);

    // If no session exists, initialize it first
    if (!session) {
      this.initializeRecording(pokemonId);
      session = this.recordingSessions.get(pokemonId);
    }
    if (!session) {
      console.error('Failed to initialize recording session');
      return;
    }

    const { record, isRecording, playbackWavesurfer } = session;

    // If a recording already exists, just play it back
    if (playbackWavesurfer) {
      playbackWavesurfer.play();
      return;
    }

    // Otherwise, toggle recording on/off
    if (isRecording) {
      record.stopRecording();
      session.isRecording = false;

      setTimeout(() => {
        this.compareAudio(pokemonId);
      }, 500);
    } else {
      record.startRecording();
      session.isRecording = true;
    }
  }

  private fetchPokemon(): void {
    this.isLoading = true;
    this.error = null;

    this.apollo
      .query<PokemonListResponse>({
        query: GET_POKEMON_LIST,
        variables: { limit: 20, offset: Math.floor(Math.random() * (152 - 20)) },
      })
      .subscribe({
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
