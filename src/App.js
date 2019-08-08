import React, {useState, useEffect} from 'react';
import axios from 'axios';

const axiosGitHubGraphQL = axios.create({
  baseURL: 'https://api.github.com/graphql',
  headers: {
    Authorization: `bearer ${process.env.REACT_APP_GITHUB_PERSONAL_ACCESS_TOKEN}`
  }
});

const GET_ISSUES_OF_REPOSITORY  = `
  query($organization: String!, $repository: String!, $cursor: String) {
    organization(login: $organization) {
      name
      url
      repository(name: $repository) {
        id
        name
        url
        stargazers {
          totalCount
        }
        viewerHasStarred
        issues(first: 5, after: $cursor, states: [OPEN]) {
          edges {
            node {
              id
              title
              url
              reactions(last: 3) {
                edges {
                  node {
                    id
                    content
                  }
                }
              }
            }
          }
          totalCount
          pageInfo {
            endCursor
            hasNextPage
          }
        }
      }
    }
  }
`;

const ADD_STAR = `
  mutation ($repositoryId: ID!) {
    addStar(input:{starrableId:$repositoryId}) {
      starrable {
        viewerHasStarred
      }
    }
  }
`;

const REMOVE_STAR = `
  mutation ($repositoryId: ID!) {
    removeStar(input:{starrableId:$repositoryId}) {
      starrable {
        viewerHasStarred
      }
    }
  }
`;

const getIssuesOfRepository = (path, cursor) => {
  const [organization, repository] = path.split('/')
  return axiosGitHubGraphQL.post('', {
    query: GET_ISSUES_OF_REPOSITORY,
    variables: {organization, repository, cursor},
  })
}

const resolveIssuesQuery = (queryResult, cursor) => state => {
  const {data, errors} = queryResult.data
  if (!cursor) return {...state, organization: data.organization, errors}

  const {edges: oldIssues} = state.organization.repository.issues;
  const {edges: newIssues} = data.organization.repository.issues;
  const updatedIssues = [...oldIssues, ...newIssues];

  return {
    ...state,
    organization: {
      ...data.organization,
      repository: {
        ...data.organization.repository,
        issues: {
          ...data.organization.repository.issues,
          edges: updatedIssues,
        },
      },
    },
    errors
  }
}

const addStarToRepository = repositoryId => {
  return axiosGitHubGraphQL.post('', {
    query: ADD_STAR,
    variables: { repositoryId },
  })
}

const removeStarFromRepository = repositoryId => {
  return axiosGitHubGraphQL.post('', {
    query: REMOVE_STAR,
    variables: { repositoryId },
  })
}

const resolveStarMutation = (mutationResult, opFlag) => state => {
  const {viewerHasStarred} = opFlag === 'ADD_STAR' ? mutationResult.data.data.addStar.starrable : mutationResult.data.data.removeStar.starrable
  const { totalCount } = state.organization.repository.stargazers;

  return {
    ...state,
    organization: {
      ...state.organization,
      repository: {
        ...state.organization.repository,
        viewerHasStarred,
        stargazers: {
          totalCount: opFlag === 'ADD_STAR' ? totalCount + 1 : totalCount - 1,
        }
      }
    }
  }
}

const TITLE = 'React GraphQL GitHub Client'

const App = () => {
  const [state, setState] = useState({path: 'the-road-to-learn-react/the-road-to-learn-react', organization: null, errors: null});

  useEffect(() => {
    onFetchFromGitHub(state.path)
  }, [state.path]);

  const onSubmit = event => {
    onFetchFromGitHub(state.path);
    event.preventDefault();
  }

  const onChange = event => {
    setState(prevState => {return {...prevState, path: event.target.value}});
  }

  const onFetchFromGitHub = (path, cursor) => {
    getIssuesOfRepository(path, cursor)
      .then(queryResult => setState(resolveIssuesQuery(queryResult))
    )
  }

  const onFetchMoreIssues = () => {
    const {endCursor} = state.organization.repository.issues.pageInfo;
    onFetchFromGitHub(state.path, endCursor);
  }

  const onStarRepository = (repositoryId, viewerHasStarred) => {
    viewerHasStarred ?
      removeStarFromRepository(repositoryId)
        .then(mutationResult => setState(resolveStarMutation(mutationResult, 'REMOVE_STAR')))
      :
      addStarToRepository(repositoryId)
        .then(mutationResult => setState(resolveStarMutation(mutationResult, 'ADD_STAR')))
  }

  const {path, organization, errors} = state;
  return (
    <div>
      <h1>{TITLE}</h1>

      <form onSubmit={onSubmit}>
        <label htmlFor="url">
          Show open issues for https://github.com/
        </label>
        <input
          id="url"
          type="text"
          value={path}
          onChange={onChange}
          style={{width: '300px'}} />
        <button type="submit">Search</button>
      </form>
      <hr />
      {organization ? (
        <Organization
          organization={organization}
          errors={errors}
          onFetchMoreIssues={onFetchMoreIssues}
          onStarRepository={onStarRepository}
        />
      ) : (
        <p>No information yet ...</p>
      )}
    </div>
  );
}

const Organization = ({organization, errors, onFetchMoreIssues, onStarRepository}) => {
  if (errors) {
    return (
      <p>
        <strong>Something went wrong:</strong>
        {errors.map(error => error.message).join(' ')}
      </p>
    );
  }

  return (
    <div>
      <p>
        <strong>Issues from Organization:</strong>
        <a href={organization.url}>{organization.name}</a>
      </p>
      <Repository
        repository={organization.repository}
        onFetchMoreIssues={onFetchMoreIssues}
        onStarRepository={onStarRepository}
      />
    </div>
  );
};

const Repository = ({repository, onFetchMoreIssues, onStarRepository}) => (
  <div>
    <p>
      <strong>In Repository:</strong>
      <a href={repository.url}>{repository.name}</a>
    </p>

    <button
      type="button"
      onClick={() =>
        onStarRepository(repository.id, repository.viewerHasStarred)
      }>
      {repository.stargazers.totalCount}
      {repository.viewerHasStarred ? 'Unstar' : 'Star'}
    </button>

    <ul>
      {repository.issues.edges.map(issue => (
        <li key={issue.node.id}>
          <a href={issue.node.url}>{issue.node.title}</a>

          <ul>
            {issue.node.reactions.edges.map(reaction => (
              <li key={reaction.node.id}>{reaction.node.content}</li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
    <hr />

    {repository.issues.pageInfo.hasNextPage && (
      <button onClick={onFetchMoreIssues}>More</button>
    )}
  </div>
);

export default App;
